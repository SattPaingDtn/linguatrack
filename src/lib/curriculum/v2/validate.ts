import { z } from "zod";
import { curriculumSchema } from "../schema";
import { LIMITS, type LegacyOrigin, type Ref } from "./common";
import { atPointer, ContentValidationError, fingerprint, pointer, type Diagnostic } from "./json";
import { packageSchema, type CurriculumPackage } from "./package";
import type { Exercise, PublicEntity } from "./public";
import type { GradingRule } from "./private";
export type RegistrySnapshot = {
  releases: { curriculumId: string; contentVersion: string; hash: string; entityRefs: Ref[] }[];
  entities: { ref: Ref; hash: string }[];
  grading: { exerciseRef: Ref<"exercise">; gradingRevision: number; hash: string }[];
  policies: { assessmentRef: Ref<"assessment">; policyRevision: number; hash: string }[];
};
export type ValidationOptions = {
  legacy?: unknown;
  legacyHash?: string;
  registry?: RegistrySnapshot;
  releaseHash?: string;
  descriptorRegistry?: ReadonlySet<string>;
};
export const refKey = (r: Ref) => `${r.kind}:${r.id}@${r.revision}`;
export function legacyEntities(raw: unknown) {
  const legacy = curriculumSchema.parse(raw);
  const index = new Map<string, unknown>();
  for (const course of legacy.courses) {
    index.set(`course:${course.id}`, course);
    for (const chapter of course.chapters) {
      index.set(`chapter:${chapter.id}`, chapter);
      for (const lesson of chapter.lessons) {
        index.set(`lesson:${lesson.id}`, lesson);
        for (const block of lesson.blocks) {
          index.set(`block:${block.id}`, block);
          if (block.type === "quiz")
            for (const q of block.questions) index.set(`question:${q.id}`, q);
        }
      }
    }
  }
  return { legacy, index };
}
export function legacyValue(index: Map<string, unknown>, origin: LegacyOrigin) {
  return atPointer(index.get(`${origin.kind}:${origin.id}`), origin.pointer ?? "");
}
export function normalizeBlank(value: string) {
  return value
    .normalize("NFC")
    .replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "")
    .replace(/[\t\n\r ]+/g, " ")
    .toLowerCase();
}
export function registrySnapshot(
  pkg: CurriculumPackage,
  releaseHash = fingerprint(pkg),
): RegistrySnapshot {
  return {
    releases: [
      {
        curriculumId: pkg.manifest.curriculumId,
        contentVersion: pkg.manifest.contentVersion,
        hash: releaseHash,
        entityRefs: [
          ...Object.values(pkg.public).flat(),
          ...pkg.private.transcripts,
          ...pkg.private.rubrics,
        ].map((e) => ({ kind: e.kind, id: e.id, revision: e.revision })),
      },
    ],
    entities: [
      ...Object.values(pkg.public).flat(),
      ...pkg.private.transcripts,
      ...pkg.private.rubrics,
    ].map((e) => ({ ref: { kind: e.kind, id: e.id, revision: e.revision }, hash: fingerprint(e) })),
    grading: pkg.private.grading.exerciseRules.map((r) => ({
      exerciseRef: r.exerciseRef,
      gradingRevision: r.gradingRevision,
      hash: fingerprint(r),
    })),
    policies: pkg.private.grading.assessmentPolicies.map((p) => ({
      assessmentRef: p.assessmentRef,
      policyRevision: p.policyRevision,
      hash: fingerprint(p),
    })),
  };
}
export function validatePackage(
  input: unknown,
  options: ValidationOptions = {},
): CurriculumPackage {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(
      parsed.error.issues.map((issue) => ({
        code: "schema",
        path: pointer(issue.path.map(String)),
        message: issue.message,
      })),
    );
  const pkg = parsed.data;
  const errors: Diagnostic[] = [];
  const issue = (code: string, path: string, message: string) => {
    errors.push({ code, path, message });
  };
  const unique = (items: readonly string[], path: string) => {
    if (new Set(items).size !== items.length)
      issue("duplicate", path, "Values must be unique within this owner");
  };
  const index = new Map<string, PublicEntity | CurriculumPackage["private"]["rubrics"][number]>();
  const locations = new Map<string, string>();
  const privateIds = new Set<string>();
  const all = [
    ...Object.entries(pkg.public).flatMap(([collection, values]) =>
      values.map((e, i) => ({ e, path: `/public/${collection}/${i}` })),
    ),
    ...pkg.private.transcripts.map((e, i) => ({ e, path: `/private/transcripts/${i}` })),
    ...pkg.private.rubrics.map((e, i) => ({ e, path: `/private/rubrics/${i}` })),
  ];
  if (all.length > LIMITS.entities) issue("entity-limit", "/", "Too many entities");
  for (const { e, path } of all) {
    if (locations.has(e.id))
      issue(
        "duplicate-id",
        `${path}/id`,
        `ID ${e.id} is already defined at ${locations.get(e.id)}`,
      );
    locations.set(e.id, path);
    index.set(refKey(e), e);
    if (path.startsWith("/private")) privateIds.add(e.id);
  }
  const resolve = (r: Ref, path: string) => {
    const e = index.get(refKey(r));
    if (!e) issue("reference", path, `Missing exact reference ${refKey(r)}`);
    return e;
  };
  const registeredEntity = (version: string, r: Ref) => {
    const release = options.registry?.releases.find(
      (v) =>
        v.curriculumId === pkg.manifest.curriculumId &&
        v.contentVersion === version &&
        v.entityRefs.some((e) => refKey(e) === refKey(r)),
    );
    return release
      ? options.registry?.entities.find((e) => refKey(e.ref) === refKey(r))
      : undefined;
  };
  const walk = (
    value: unknown,
    path: string,
    visitor: (obj: Record<string, unknown>, path: string) => void,
  ) => {
    if (value === null || typeof value !== "object") return;
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (v) =>
          v &&
          typeof v === "object" &&
          "kind" in v &&
          "id" in v &&
          "revision" in v &&
          Object.keys(v).length === 3,
      )
    )
      unique((value as Ref[]).map(refKey), path);
    if (!Array.isArray(value)) visitor(value as Record<string, unknown>, path);
    for (const [k, child] of Object.entries(value)) walk(child, `${path}/${k}`, visitor);
  };
  walk(pkg, "", (obj, path) => {
    if (
      typeof obj.kind === "string" &&
      typeof obj.id === "string" &&
      typeof obj.revision === "number" &&
      Object.keys(obj).length === 3
    ) {
      if (/^\/compatibility\/\d+\/from\/ref$/.test(path)) {
        if (!options.registry?.entities.some((x) => refKey(x.ref) === refKey(obj as Ref)))
          issue(
            "compatibility-source",
            path,
            "Historic source reference must resolve in the registry snapshot",
          );
        return;
      }
      const historicalTarget = /^\/compatibility\/(\d+)\/to\/ref$/.exec(path);
      if (historicalTarget) {
        const mapping = pkg.compatibility[Number(historicalTarget[1])]!;
        if (mapping.to.contentVersion !== pkg.manifest.contentVersion) return; // Checked against its release registry below.
      }
      const e = resolve(obj as Ref, path);
      if (path.startsWith("/public") && e && privateIds.has(e.id)) {
        // A public listening stimulus may name a private transcript, but never expose its text.
        const allowed =
          /\/public\/stimuli\/\d+\/transcriptRef$/.test(path) && e.kind === "transcript";
        if (!allowed)
          issue(
            "private-reference",
            path,
            "Public content cannot reference private grading entities",
          );
      }
    }
  });
  const byId = <K extends PublicEntity["kind"]>(r: Ref<K>) =>
    index.get(refKey(r)) as Extract<PublicEntity, { kind: K }> | undefined;
  const leaves = (refs: Ref<"exercise">[], path: string): Exercise[] => {
    const result: Exercise[] = [];
    for (const r of refs) {
      const e = byId(r);
      if (!e) continue;
      if (e.type === "reading_comprehension" || e.type === "listening_comprehension") {
        for (const child of e.itemRefs) {
          const item = byId(child);
          if (
            item &&
            ["multiple_choice", "matching", "fill_in_blank", "sentence_ordering"].includes(
              item.type,
            )
          )
            result.push(item);
          else
            issue(
              "comprehension-leaf",
              path,
              "Comprehension must contain objective atomic items, without nested groups",
            );
        }
      } else result.push(e);
    }
    unique(
      result.map((e) => refKey(e)),
      path,
    );
    return result;
  };
  unique(pkg.manifest.requiredCapabilities, "/manifest/requiredCapabilities");
  unique(
    pkg.manifest.files.map((f) => f.path),
    "/manifest/files",
  );
  for (const [i, f] of pkg.manifest.files.entries()) {
    const path = `/manifest/files/${i}`;
    const expected =
      f.collection === "grading" || f.collection === "rubrics"
        ? "private"
        : f.collection === "compatibility"
          ? "internal"
          : f.collection === "transcripts"
            ? f.visibility
            : "public";
    if (
      f.visibility !== expected ||
      (f.collection === "transcripts" && f.visibility === "internal")
    )
      issue("visibility", path, `Invalid visibility for ${f.collection}`);
    if (
      f.collection !== "media" &&
      f.collection !== "compatibility" &&
      !f.path.startsWith(`${f.visibility}/`)
    )
      issue("file-boundary", path, "Collection path must match its visibility directory");
    if (f.collection === "media" && !f.path.startsWith("media/"))
      issue("file-boundary", path, "Media belongs in media/");
    if (f.collection === "compatibility" && f.path !== "compatibility.json")
      issue("file-boundary", path, "Compatibility belongs in compatibility.json");
    if (pkg.manifest.state === "sealed" && (f.sha256 === null || f.byteLength === null))
      issue("sealed-integrity", path, "Sealed files require exact hashes and lengths");
  }
  for (const collection of [...Object.keys(pkg.public), "grading", "rubrics", "compatibility"])
    if (!pkg.manifest.files.some((f) => f.collection === collection))
      issue("inventory", "/manifest/files", `Missing file collection ${collection}`);
  unique(pkg.manifest.courseRefs.map(refKey), "/manifest/courseRefs");
  if (pkg.manifest.courseRefs.length !== pkg.public.courses.length)
    issue(
      "course-inventory",
      "/manifest/courseRefs",
      "Manifest must name every course exactly once",
    );
  const owned = (refs: Ref[], childKind: string, parent: Ref, field: string, path: string) => {
    unique(refs.map(refKey), path);
    for (const r of refs) {
      const child = index.get(refKey(r));
      const value = child && (child as Record<string, unknown>)[field];
      if (child && (child.kind !== childKind || !value || refKey(value as Ref) !== refKey(parent)))
        issue("ownership", path, `Child ${r.id} has a different parent`);
    }
  };
  const expectParentList = (r: Ref, parent: Ref, field: string, path: string) => {
    const e = index.get(refKey(parent));
    const refs = e && ((e as Record<string, unknown>)[field] as Ref[] | undefined);
    if (refs && !refs.some((item) => refKey(item) === refKey(r)))
      issue("orphan", path, `Parent does not include ${r.id}`);
  };
  unique(
    pkg.public.courses.map((e) => e.slug),
    "/public/courses/slugs",
  );
  for (const e of pkg.public.courses) {
    const path = locations.get(e.id)!;
    owned(e.chapterRefs, "chapter", e, "courseRef", path);
    const chapters = e.chapterRefs.map(byId).filter((v) => v !== undefined);
    unique(
      chapters.map((c) => c.slug),
      `${path}/chapterRefs/slugs`,
    );
    unique(
      chapters.map((c) => String(c.order)),
      `${path}/chapterRefs/orders`,
    );
    if ((e.status === "available") !== e.chapterRefs.length > 0)
      issue(
        "course-status",
        path,
        "Available courses need chapters; planned courses must remain empty",
      );
    if (e.coverageState === "complete") {
      for (const area of ["grammar", "vocabulary", "listening", "speaking", "reading", "writing"])
        if (!e.coverageTargets.some((t) => t.area === area))
          issue("coverage", path, `Complete coverage must declare ${area}`);
      if (pkg.manifest.legacyLocaleExceptions.some((x) => x.reviewStatus !== "approved"))
        issue("coverage", path, "Unreviewed legacy translations prevent complete coverage");
      if (e.status === "planned")
        issue("coverage", path, "A planned course cannot have complete coverage");
    }
  }
  for (const e of pkg.public.chapters) {
    const path = locations.get(e.id)!;
    expectParentList(e, e.courseRef, "chapterRefs", path);
    owned(e.lessonRefs, "lesson", e, "chapterRef", path);
    owned(e.assessmentRefs, "assessment", e, "chapterRef", path);
    unique(
      e.lessonRefs
        .map(byId)
        .filter((v) => v !== undefined)
        .map((l) => l.slug),
      `${path}/lessonRefs/slugs`,
    );
  }
  for (const e of pkg.public.lessons) {
    const path = locations.get(e.id)!;
    expectParentList(e, e.chapterRef, "lessonRefs", path);
    owned(e.blockRefs, "block", e, "lessonRef", path);
    if (!Number.isInteger(e.difficulty.estimatedMinutes))
      issue("lesson-duration", path, "Lesson minutes must be integer");
    if (e.completionPolicy.type === "assessment_pass") {
      const assessment = byId(e.completionPolicy.assessmentRef);
      if (assessment && refKey(assessment.delivery.lessonRef) !== refKey(e))
        issue(
          "completion-delivery",
          path,
          "Completion assessment must be delivered by this lesson",
        );
    }
  }
  const rules = new Map<string, GradingRule>();
  for (const [i, rule] of pkg.private.grading.exerciseRules.entries()) {
    const path = `/private/grading/exerciseRules/${i}`;
    const key = refKey(rule.exerciseRef);
    if (rules.has(key))
      issue("duplicate-rule", path, "Exactly one grading rule is permitted per atomic exercise");
    rules.set(key, rule);
    const e = byId(rule.exerciseRef);
    if (!e) continue;
    if (e.type !== rule.type) {
      issue("grading-type", path, "Rule and exercise types differ");
      continue;
    }
    if (e.type === "multiple_choice" && rule.type === "multiple_choice") {
      unique(rule.correctOptionIds, `${path}/correctOptionIds`);
      if (e.selection === "single" && rule.correctOptionIds.length !== 1)
        issue("answer-key", path, "Single choice needs exactly one correct option");
      for (const id of rule.correctOptionIds)
        if (!e.options.some((o) => o.id === id))
          issue("answer-key", path, `Correct option ${id} does not exist`);
      if (rule.graderVersion !== "multiple-choice-exact-set-v1")
        issue("grader-version", path, "Unsupported multiple-choice grader");
    }
    if (e.type === "matching" && rule.type === "matching") {
      unique(
        rule.acceptedPairs.map((p) => p.leftId),
        path,
      );
      if (
        rule.acceptedPairs.length !== e.left.length ||
        rule.acceptedPairs.some(
          (p) => !e.left.some((o) => o.id === p.leftId) || !e.right.some((o) => o.id === p.rightId),
        )
      )
        issue(
          "answer-key",
          path,
          "Matching key must cover every left item with existing right IDs",
        );
      if (e.mode === "one_to_one")
        unique(
          rule.acceptedPairs.map((p) => p.rightId),
          path,
        );
      if (rule.scoring === "per_pair" && rule.maxPoints % e.left.length !== 0)
        issue("point-divisibility", path, "Points must divide evenly among pairs");
    }
    if (e.type === "fill_in_blank" && rule.type === "fill_in_blank") {
      const blanks = e.segments.filter((s) => s.type === "blank").map((s) => s.id);
      unique(
        rule.acceptedByBlank.map((b) => b.blankId),
        path,
      );
      if (
        fingerprint([...blanks].sort()) !==
        fingerprint(rule.acceptedByBlank.map((b) => b.blankId).sort())
      )
        issue("answer-key", path, "Blank key must cover exactly the declared blanks");
      for (const b of rule.acceptedByBlank) unique(b.variants.map(normalizeBlank), path);
      if (rule.scoring === "per_blank" && rule.maxPoints % blanks.length !== 0)
        issue("point-divisibility", path, "Points must divide evenly among blanks");
    }
    if (e.type === "sentence_ordering" && rule.type === "sentence_ordering")
      for (const order of rule.acceptedOrders)
        if (fingerprint([...order].sort()) !== fingerprint(e.tokens.map((t) => t.id).sort()))
          issue("answer-key", path, "Each accepted ordering must contain every token exactly once");
    if (
      (e.type === "writing_submission" && rule.type === "writing_submission") ||
      (e.type === "speaking_recording" && rule.type === "speaking_recording")
    ) {
      const rubric = index.get(refKey(rule.rubricRef));
      if (
        rubric?.kind === "rubric" &&
        (rubric.coreSkill !== (e.type === "writing_submission" ? "writing" : "speaking") ||
          rubric.criteria.reduce((n, c) => n + c.maxPoints, 0) !== rule.maxPoints)
      )
        issue("rubric-binding", path, "Rubric skill/point total must match the production rule");
    }
  }
  for (const e of pkg.public.exercises) {
    const path = locations.get(e.id)!;
    const group = e.type === "reading_comprehension" || e.type === "listening_comprehension";
    if (!group && !rules.has(refKey(e)))
      issue("missing-rule", path, "Atomic exercise needs one private grading rule");
    if (group) {
      if (rules.has(refKey(e)))
        issue("container-grading", path, "Comprehension containers cannot be graded twice");
      const stimulus = byId(e.stimulusRef);
      if (
        stimulus &&
        stimulus.type !== (e.type === "reading_comprehension" ? "reading" : "listening")
      )
        issue("stimulus-type", path, "Comprehension stimulus has the wrong type");
      leaves([e], path);
      for (const r of e.itemRefs) {
        const item = byId(r);
        if (
          item &&
          (!e.objectiveRefs.some((o) => item.objectiveRefs.some((c) => refKey(o) === refKey(c))) ||
            !item.tags.areas.some((area) => e.tags.areas.includes(area)))
        )
          issue(
            "comprehension-objective",
            path,
            "Child item must share an objective and area with its group",
          );
      }
      if (
        e.assistance === "independent" &&
        stimulus?.type === "listening" &&
        stimulus.transcriptAccess === "always"
      )
        issue(
          "independent-support",
          path,
          "A public transcript cannot be independent listening evidence",
        );
    }
    if (e.type === "multiple_choice")
      unique(
        e.options.map((o) => o.id),
        path,
      );
    if (e.type === "matching") {
      unique(
        e.left.map((o) => o.id),
        path,
      );
      unique(
        e.right.map((o) => o.id),
        path,
      );
    }
    if (e.type === "sentence_ordering")
      unique(
        e.tokens.map((o) => o.id),
        path,
      );
    if (e.type === "fill_in_blank") {
      const ids = e.segments.filter((s) => s.type === "blank").map((s) => s.id);
      unique(ids, path);
      if (ids.length < 1 || ids.length > 50) issue("blank-count", path, "Expected 1–50 blanks");
    }
    if (e.type === "writing_submission" && e.limits.minWords > e.limits.maxWords)
      issue("word-range", path, "minWords exceeds maxWords");
    if (e.type === "speaking_recording") {
      if (e.limits.minSeconds > e.limits.maxSeconds)
        issue("recording-range", path, "minSeconds exceeds maxSeconds");
      unique(e.limits.mimeTypes, path);
    }
    if (!pkg.manifest.requiredCapabilities.includes(e.type))
      issue("capability", path, `Manifest must declare ${e.type}`);
  }
  if (pkg.private.rubrics.length > 0 && !pkg.manifest.requiredCapabilities.includes("human-rubric"))
    issue(
      "capability",
      "/manifest/requiredCapabilities",
      "Production rubrics require the human-rubric capability",
    );
  for (const e of pkg.private.rubrics) {
    const path = locations.get(e.id)!;
    unique(
      e.criteria.map((c) => c.id),
      path,
    );
    for (const c of e.criteria) {
      unique(
        c.anchors.map((a) => String(a.points)),
        path,
      );
      if (c.anchors.length !== c.maxPoints + 1 || c.anchors.some((a) => a.points > c.maxPoints))
        issue(
          "rubric-scale",
          path,
          "Criterion anchors must cover every integer from zero to maxPoints",
        );
    }
  }
  const policies = new Map(
    pkg.private.grading.assessmentPolicies.map((p) => [refKey(p.assessmentRef), p]),
  );
  unique(
    pkg.private.grading.assessmentPolicies.map((p) => refKey(p.assessmentRef)),
    "/private/grading/assessmentPolicies",
  );
  for (const e of pkg.public.assessments) {
    const path = locations.get(e.id)!;
    unique(
      e.sections.map((s) => s.id),
      path,
    );
    expectParentList(e, e.chapterRef, "assessmentRefs", path);
    const lesson = byId(e.delivery.lessonRef);
    const block = byId(e.delivery.blockRef);
    if (lesson && refKey(lesson.chapterRef) !== refKey(e.chapterRef))
      issue("assessment-delivery", path, "Assessment and lesson chapters differ");
    if (
      block &&
      (refKey(block.lessonRef) !== refKey(e.delivery.lessonRef) ||
        !["quiz", "exercise_set"].includes(block.type))
    )
      issue("assessment-delivery", path, "Assessment requires an exercise delivery in its lesson");
    const items = leaves(
      e.sections.flatMap((s) => s.exerciseRefs),
      path,
    );
    if (items.length === 0 || items.length > 1000)
      issue("assessment-size", path, "Assessment must have 1–1000 distinct scored leaves");
    if (
      block &&
      (block.type === "quiz" || block.type === "exercise_set") &&
      fingerprint(leaves(block.exerciseRefs, path).map(refKey)) !== fingerprint(items.map(refKey))
    )
      issue(
        "assessment-items",
        path,
        "Assessment and delivery must have the same ordered scored leaves",
      );
    if (
      block?.type === "quiz" &&
      (!block.assessmentRef || refKey(block.assessmentRef) !== refKey(e))
    )
      issue("assessment-delivery", path, "Quiz must point back to its assessment");
    const p = policies.get(refKey(e));
    if (!p) {
      issue("missing-policy", path, "Assessment needs one private policy");
      continue;
    }
    unique(p.requiredItems.map(refKey), path);
    unique(
      p.itemWeights.map((w) => refKey(w.exerciseRef)),
      path,
    );
    unique(
      p.sectionMinimums.map((s) => s.sectionId),
      path,
    );
    const expected = items.map(refKey).sort();
    if (
      fingerprint(expected) !== fingerprint(p.requiredItems.map(refKey).sort()) ||
      fingerprint(expected) !== fingerprint(p.itemWeights.map((w) => refKey(w.exerciseRef)).sort())
    )
      issue(
        "assessment-policy",
        path,
        "Policy items and weights must cover exactly the scored leaves",
      );
    if (p.sectionMinimums.some((s) => !e.sections.some((section) => section.id === s.sectionId)))
      issue("assessment-section", path, "Section minimum names an unknown section");
    if (
      p.aggregation === "legacy-rounded-percent-v1" &&
      (p.itemWeights.some((w) => w.weight !== 1) ||
        items.some(
          (item) => item.type !== "multiple_choice" || rules.get(refKey(item))?.maxPoints !== 1,
        ) ||
        p.sectionMinimums.length > 0)
    )
      issue(
        "legacy-scoring",
        path,
        "Legacy scoring supports equal one-point MCQs and no section minimums",
      );
  }
  for (const e of pkg.public.blocks) {
    const path = locations.get(e.id)!;
    expectParentList(e, e.lessonRef, "blockRefs", path);
    if (e.type === "writing" && e.minWords > e.maxWords)
      issue("word-range", path, "Invalid self-practice word range");
    if (e.type === "reading" || e.type === "listening") {
      const stimulus = byId(e.stimulusRef);
      if (stimulus && stimulus.type !== e.type)
        issue("stimulus-type", path, "Block and stimulus types differ");
    }
    if (e.type === "quiz" || e.type === "exercise_set") leaves(e.exerciseRefs, path);
  }
  for (const e of pkg.public.assets) {
    const path = locations.get(e.id)!;
    if (/^(audio|video)\//.test(e.contentType) && !e.durationMs)
      issue("media-duration", path, "Audio/video needs decoded duration metadata");
    if (e.contentType.startsWith("image/") && !e.alt)
      issue("media-alt", path, "Images require bilingual alt text");
    if (e.contentType.startsWith("image/") && e.durationMs !== undefined)
      issue("media-duration", path, "Still images cannot have duration metadata");
    const storage = e.storage;
    if (
      storage.type === "package" &&
      (!storage.path.startsWith("media/") ||
        !pkg.manifest.files.some((f) => f.collection === "media" && f.path === storage.path))
    )
      issue("media-inventory", path, "Package asset is absent from manifest media inventory");
    if (
      !pkg.manifest.requiredCapabilities.includes(
        e.storage.type === "package" ? "package-media" : "managed-media",
      )
    )
      issue("capability", path, "Manifest must declare its media storage capability");
  }
  for (const e of pkg.public.stimuli)
    if (e.type === "listening") {
      const path = locations.get(e.id)!;
      const transcript = index.get(refKey(e.transcriptRef));
      const audio = byId(e.audioRef);
      if (audio && !audio.contentType.startsWith("audio/"))
        issue("audio-type", path, "Listening requires an audio asset");
      if (e.transcriptAccess === "always" && privateIds.has(e.transcriptRef.id))
        issue("transcript-visibility", path, "Always-visible transcript must be public");
      if (e.transcriptAccess !== "always" && !privateIds.has(e.transcriptRef.id))
        issue("public-transcript-leak", path, "Delayed/reviewer transcript must be private");
      if (transcript?.kind === "transcript") {
        let end = 0;
        for (const segment of transcript.segments) {
          if (
            segment.startMs < end ||
            segment.endMs <= segment.startMs ||
            (audio?.durationMs !== undefined && segment.endMs > audio.durationMs)
          )
            issue(
              "transcript-timing",
              path,
              "Segments must be ordered, nonoverlapping and within audio duration",
            );
          end = segment.endMs;
        }
      }
    }
  // Required prerequisites plus lesson completion gates form one dependency graph.
  const edges = new Map<string, string[]>();
  for (const e of [...pkg.public.chapters, ...pkg.public.lessons, ...pkg.public.assessments]) {
    const dependencies = e.prerequisites
      .filter((p) => p.enforcement === "required")
      .map((p) => refKey(p.target));
    if (e.kind === "lesson" && e.completionPolicy.type === "assessment_pass")
      dependencies.push(refKey(e.completionPolicy.assessmentRef));
    if (e.kind === "lesson" || e.kind === "assessment") dependencies.push(refKey(e.chapterRef));
    unique(
      e.prerequisites.map((p) => refKey(p.target)),
      `${locations.get(e.id)}/prerequisites`,
    );
    edges.set(refKey(e), dependencies);
  }
  const done = new Set<string>();
  for (const root of edges.keys()) {
    if (done.has(root)) continue;
    const visiting = new Set<string>();
    const stack: { key: string; exit: boolean }[] = [{ key: root, exit: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        visiting.delete(frame.key);
        done.add(frame.key);
        continue;
      }
      if (visiting.has(frame.key)) {
        issue(
          "prerequisite-cycle",
          locations.get(frame.key.split(":")[1]!.split("@")[0]!) ?? "/",
          `Required dependency cycle at ${frame.key}`,
        );
        continue;
      }
      if (done.has(frame.key)) continue;
      visiting.add(frame.key);
      stack.push({ key: frame.key, exit: true });
      for (const dependency of edges.get(frame.key) ?? [])
        stack.push({ key: dependency, exit: false });
    }
  }
  // Tags describe teaching; evidence must be supported by an appropriate exercise type.
  for (const { e, path } of all)
    if ("tags" in e) {
      unique(e.tags.areas, `${path}/tags/areas`);
      unique(e.tags.coreSkills, `${path}/tags/coreSkills`);
    }
  for (const objective of pkg.public.objectives)
    for (const descriptor of objective.descriptorRefs)
      if (!options.descriptorRegistry?.has(`${descriptor.edition}:${descriptor.descriptorId}`))
        issue(
          "cefr-descriptor",
          locations.get(objective.id)!,
          "Descriptor must resolve in a reviewed external registry",
        );
  const evidenceFor = (exercise: Exercise, kind: string) =>
    kind === "recognition"
      ? ["multiple_choice", "matching", "fill_in_blank", "sentence_ordering"].includes(
          exercise.type,
        )
      : kind === "comprehension"
        ? ["reading_comprehension", "listening_comprehension"].includes(exercise.type)
        : kind === "written_production"
          ? exercise.type === "writing_submission"
          : kind === "spoken_production"
            ? exercise.type === "speaking_recording"
            : false;
  for (const e of [...pkg.public.courses, ...pkg.public.chapters, ...pkg.public.assessments]) {
    const targets = e.kind === "assessment" ? e.declaredCoverage : e.coverageTargets;
    const chapters =
      e.kind === "course" ? e.chapterRefs.map(byId).filter((v) => v !== undefined) : [];
    const lessonIds = new Set(
      e.kind === "chapter"
        ? e.lessonRefs.map((r) => r.id)
        : e.kind === "course"
          ? chapters.flatMap((c) => c.lessonRefs.map((r) => r.id))
          : [e.delivery.lessonRef.id],
    );
    const exerciseRefs =
      e.kind === "assessment"
        ? e.sections.flatMap((s) => s.exerciseRefs)
        : pkg.public.blocks
            .filter((b) => lessonIds.has(b.lessonRef.id))
            .flatMap((b) => (b.type === "quiz" || b.type === "exercise_set" ? b.exerciseRefs : []));
    const delivered = exerciseRefs.map(byId).filter((v) => v !== undefined);
    const candidates = [...delivered, ...leaves(exerciseRefs, locations.get(e.id)!)];
    for (const target of targets) {
      if (
        target.area === "speaking" &&
        target.evidenceKind !== "teaching" &&
        target.evidenceKind !== "spoken_production"
      )
        issue(
          "coverage-evidence",
          locations.get(e.id)!,
          "Speaking proficiency evidence requires spoken production",
        );
      if (target.area === "writing" && target.evidenceKind === "recognition")
        issue(
          "coverage-evidence",
          locations.get(e.id)!,
          "Writing recognition cannot establish writing proficiency",
        );
      const count =
        target.evidenceKind === "teaching"
          ? pkg.public.lessons.filter(
              (l) =>
                lessonIds.has(l.id) &&
                l.tags.areas.includes(target.area) &&
                target.objectiveRefs.every((r) =>
                  l.objectiveRefs.some((o) => refKey(r) === refKey(o)),
                ),
            ).length
          : new Set(
              candidates
                .filter(
                  (x) =>
                    x.tags.areas.includes(target.area) &&
                    evidenceFor(x, target.evidenceKind) &&
                    target.objectiveRefs.every((r) =>
                      x.objectiveRefs.some((o) => refKey(r) === refKey(o)),
                    ),
                )
                .map(refKey),
            ).size;
      if (count < target.minimumDistinctItems)
        issue(
          "coverage",
          locations.get(e.id)!,
          `Insufficient ${target.area}/${target.evidenceKind} evidence: ${count} of ${target.minimumDistinctItems}`,
        );
    }
    if (e.kind === "course" && e.coverageState === "complete")
      for (const [area, kind] of [
        ["speaking", "spoken_production"],
        ["writing", "written_production"],
        ["listening", "comprehension"],
        ["reading", "comprehension"],
      ])
        if (!targets.some((t) => t.area === area && t.evidenceKind === kind))
          issue("coverage", locations.get(e.id)!, `Complete course requires ${area}/${kind}`);
  }
  // Verify exact source text: no blanket optional locale or fabricated Burmese fallback.
  let baseline: ReturnType<typeof legacyEntities> | undefined;
  if (options.legacy !== undefined) baseline = legacyEntities(options.legacy);
  const hasLegacy =
    pkg.manifest.legacyLocaleExceptions.length > 0 ||
    all.some(({ e }) => e.source) ||
    pkg.compatibility.some((m) => m.from.schemaVersion === 1);
  if (
    hasLegacy &&
    (!baseline ||
      !options.legacyHash ||
      (pkg.manifest.basedOn.schemaVersion === 1 &&
        (options.legacyHash !== pkg.manifest.basedOn.sha256 ||
          baseline.legacy.contentVersion !== pkg.manifest.basedOn.contentVersion)))
  )
    issue(
      "legacy-baseline",
      "/manifest/basedOn",
      "Legacy fields require the exact trusted v1 source file and SHA-256",
    );
  if (hasLegacy && !pkg.manifest.requiredCapabilities.includes("legacy-v1-bridge"))
    issue(
      "capability",
      "/manifest/requiredCapabilities",
      "Legacy provenance requires legacy-v1-bridge",
    );
  const usedExceptions = new Set<string>();
  const exceptionKey = (r: Ref, p: string) => `${refKey(r)}:${p}`;
  unique(
    pkg.manifest.legacyLocaleExceptions.map((x) => exceptionKey(x.target.ref, x.target.pointer)),
    "/manifest/legacyLocaleExceptions",
  );
  const exceptionIndex = new Map(
    pkg.manifest.legacyLocaleExceptions.map((x) => [
      exceptionKey(x.target.ref, x.target.pointer),
      x,
    ]),
  );
  for (const { e, path } of all) {
    if (
      e.source &&
      baseline &&
      (e.source.contentVersion !== baseline.legacy.contentVersion ||
        legacyValue(baseline.index, e.source) === undefined)
    )
      issue("legacy-origin", path, "Source must resolve in the immutable v1 baseline");
    walk(e, "", (obj, field) => {
      if (obj.legacy !== true) return;
      const key = exceptionKey(e, field);
      const exception = exceptionIndex.get(key);
      usedExceptions.add(key);
      if (!exception || fingerprint(exception.source) !== fingerprint(obj.source))
        issue(
          "legacy-locale",
          `${path}${field}`,
          "Legacy text requires an exact source/field exception",
        );
      if (
        baseline &&
        (fingerprint(legacyValue(baseline.index, obj.source as LegacyOrigin)) !==
          fingerprint(obj.text) ||
          (obj.source as LegacyOrigin).contentVersion !== baseline.legacy.contentVersion)
      )
        issue(
          "legacy-text",
          `${path}${field}`,
          "Legacy text must match its original source field exactly",
        );
    });
  }
  for (const x of pkg.manifest.legacyLocaleExceptions) {
    if (!usedExceptions.has(exceptionKey(x.target.ref, x.target.pointer)))
      issue(
        "legacy-locale",
        "/manifest/legacyLocaleExceptions",
        "Unused or foreign locale exception",
      );
    if (pkg.manifest.state === "sealed" && x.reviewStatus !== "approved")
      issue(
        "editorial-review",
        "/manifest/legacyLocaleExceptions",
        "Pending locale exceptions prevent sealing",
      );
  }
  unique(
    pkg.compatibility.map((x) => fingerprint({ from: x.from, targetVersion: x.to.contentVersion })),
    "/compatibility",
  );
  for (const [i, x] of pkg.compatibility.entries()) {
    const path = `/compatibility/${i}`;
    const currentTarget = x.to.contentVersion === pkg.manifest.contentVersion;
    const target = currentTarget ? index.get(refKey(x.to.ref)) : undefined;
    const historical = currentTarget ? undefined : registeredEntity(x.to.contentVersion, x.to.ref);
    if (!currentTarget && !historical)
      issue(
        "compatibility-version",
        path,
        "Historic compatibility target must resolve in a verified release registry",
      );
    const targetHash = target ? fingerprint(target) : historical?.hash;
    if (targetHash && targetHash !== x.fingerprints.target)
      issue(
        "compatibility-fingerprint",
        path,
        "Target fingerprint differs from its pinned entity revision",
      );
    if (
      x.from.schemaVersion === 1 &&
      baseline &&
      (x.from.contentVersion !== baseline.legacy.contentVersion ||
        fingerprint(legacyValue(baseline.index, x.from)) !== x.fingerprints.source)
    )
      issue(
        "compatibility-fingerprint",
        path,
        "Source version or fingerprint differs from the v1 baseline",
      );
    if (x.from.schemaVersion === 2) {
      const from = x.from;
      const record = options.registry?.entities.find((e) => refKey(e.ref) === refKey(from.ref));
      if (
        !options.registry?.releases.some(
          (r) =>
            r.curriculumId === pkg.manifest.curriculumId &&
            r.contentVersion === from.contentVersion &&
            r.entityRefs.some((ref) => refKey(ref) === refKey(from.ref)),
        ) ||
        record?.hash !== x.fingerprints.source
      )
        issue(
          "compatibility-source",
          path,
          "Historic v2 source version and fingerprint must match a verified registry snapshot",
        );
    }
    if (currentTarget && pkg.manifest.state === "sealed" && x.reviewStatus !== "approved")
      issue("compatibility-review", path, "Pending compatibility blocks sealing");
  }
  const compareVersion = (a: string, b: string) => {
    const left = a.split(".").map(BigInt);
    const right = b.split(".").map(BigInt);
    for (let i = 0; i < 3; i++) {
      if (left[i]! < right[i]!) return -1;
      if (left[i]! > right[i]!) return 1;
    }
    return 0;
  };
  if (compareVersion(pkg.manifest.contentVersion, pkg.manifest.basedOn.contentVersion) <= 0)
    issue(
      "version-conflict",
      "/manifest/contentVersion",
      "A new release version must be greater than its source release version",
    );
  if (pkg.manifest.basedOn.schemaVersion === 2) {
    const parent = options.registry?.releases.find(
      (r) =>
        r.curriculumId === pkg.manifest.curriculumId &&
        r.contentVersion === pkg.manifest.basedOn.contentVersion,
    );
    if (!parent || parent.hash !== pkg.manifest.basedOn.sha256)
      issue(
        "parent-release",
        "/manifest/basedOn",
        "A v2 working copy requires its exact verified parent release digest (use --against)",
      );
  }
  if (options.registry) {
    const current = registrySnapshot(pkg, options.releaseHash);
    const registry = options.registry;
    const oldEntities = new Map(registry.entities.map((e) => [refKey(e.ref), e]));
    const latest = new Map<string, RegistrySnapshot["entities"][number]>();
    for (const e of registry.entities)
      if (!latest.has(e.ref.id) || latest.get(e.ref.id)!.ref.revision < e.ref.revision)
        latest.set(e.ref.id, e);
    const oldGrading = new Map(registry.grading.map((r) => [refKey(r.exerciseRef), r]));
    const oldPolicies = new Map(registry.policies.map((p) => [refKey(p.assessmentRef), p]));
    const latestGrading = new Map<string, RegistrySnapshot["grading"][number]>();
    for (const r of registry.grading)
      if (
        !latestGrading.has(r.exerciseRef.id) ||
        latestGrading.get(r.exerciseRef.id)!.gradingRevision < r.gradingRevision
      )
        latestGrading.set(r.exerciseRef.id, r);
    const latestPolicy = new Map<string, RegistrySnapshot["policies"][number]>();
    for (const p of registry.policies)
      if (
        !latestPolicy.has(p.assessmentRef.id) ||
        latestPolicy.get(p.assessmentRef.id)!.policyRevision < p.policyRevision
      )
        latestPolicy.set(p.assessmentRef.id, p);
    for (const r of current.releases) {
      const old = registry.releases.find(
        (v) => v.curriculumId === r.curriculumId && v.contentVersion === r.contentVersion,
      );
      if (old && old.hash !== r.hash)
        issue(
          "release-conflict",
          "/manifest/contentVersion",
          "Release version already exists with different bytes",
        );
    }
    for (const e of current.entities) {
      const mostRecent = latest.get(e.ref.id);
      const old = oldEntities.get(refKey(e.ref));
      if (mostRecent && mostRecent.ref.kind !== e.ref.kind)
        issue("identity-kind", locations.get(e.ref.id)!, "A stable ID cannot change entity kind");
      if (old && old.hash !== e.hash)
        issue(
          "revision-conflict",
          locations.get(e.ref.id)!,
          `${refKey(e.ref)} already exists with different content`,
        );
      if (!old && mostRecent && mostRecent.ref.revision >= e.ref.revision)
        issue(
          "revision-order",
          locations.get(e.ref.id)!,
          "New entity revisions must increase monotonically",
        );
    }
    for (const r of current.grading) {
      const old = oldGrading.get(refKey(r.exerciseRef));
      const prior = latestGrading.get(r.exerciseRef.id);
      if (old && old.hash !== r.hash)
        issue(
          "grading-conflict",
          "/private/grading",
          "Changed key/explanation/scoring requires a new exercise revision and grading revision",
        );
      if (!old && prior && r.gradingRevision <= prior.gradingRevision)
        issue(
          "grading-revision",
          "/private/grading",
          "A new exercise revision requires an increased grading revision",
        );
    }
    for (const p of current.policies) {
      const old = oldPolicies.get(refKey(p.assessmentRef));
      const prior = latestPolicy.get(p.assessmentRef.id);
      if (old && old.hash !== p.hash)
        issue(
          "policy-conflict",
          "/private/grading",
          "Changed policy requires a new assessment and policy revision",
        );
      if (!old && prior && p.policyRevision <= prior.policyRevision)
        issue(
          "policy-revision",
          "/private/grading",
          "A new assessment revision requires an increased policy revision",
        );
    }
  }
  if (errors.length) throw new ContentValidationError(errors);
  return pkg;
}
// Used by CLI parsing at collection boundaries; exported to share descriptive Zod diagnostics.
export function parseWith<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ContentValidationError(
      result.error.issues.map((e) => ({
        code: "schema",
        path: `${file}${pointer(e.path.map(String))}`,
        message: e.message,
      })),
    );
  return result.data;
}
