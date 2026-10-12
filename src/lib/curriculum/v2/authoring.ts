// Offline, single-lesson authoring prototype. No runtime reader, publication or database access.
import { ref, type Ref } from "./common";
import { canonicalJson, fail, fingerprint, sha256 } from "./json";
import type { CurriculumPackage } from "./package";
import { gradingSchema } from "./private";
import { publicCollectionsSchema } from "./public";
import { refKey } from "./validate";
export type PrototypeOptions = { contentVersion: string; sourceDigest: string; createdAt: string };
export function appendGrammarPrototype(
  source: CurriculumPackage,
  publicInput: unknown,
  gradingInput: unknown,
  options: PrototypeOptions,
): CurriculumPackage {
  if (source.manifest.state !== "draft")
    fail("draft-only", "source", "Author from an inactive draft only");
  const addition = publicCollectionsSchema.parse(publicInput);
  const grading = gradingSchema.parse(gradingInput);
  if (
    addition.lessons.length !== 1 ||
    [
      addition.courses,
      addition.chapters,
      addition.assessments,
      addition.stimuli,
      addition.transcripts,
      addition.assets,
    ].some((items) => items.length) ||
    grading.assessmentPolicies.length
  )
    fail(
      "prototype-scope",
      "authoring",
      "This prototype adds one grammar lesson with blocks, objectives and exercises only",
    );
  const newLesson = addition.lessons[0]!;
  const chapter = source.public.chapters.find((c) => c.id === newLesson.chapterRef.id);
  const course =
    chapter && source.public.courses.find((c) => refKey(c) === refKey(chapter.courseRef));
  if (
    !chapter ||
    course?.level !== "A1" ||
    !newLesson.tags.areas.includes("grammar") ||
    newLesson.completionPolicy.type !== "self_reported"
  )
    fail(
      "prototype-scope",
      newLesson.id,
      "Add self-reported grammar practice to an existing A1 chapter; preserve its original assessment",
    );
  const originalEntities = [
    ...Object.values(source.public).flat(),
    ...source.private.transcripts,
    ...source.private.rubrics,
  ];
  const originalById = new Map(originalEntities.map((e) => [e.id, e]));
  for (const e of Object.values(addition).flat())
    if (originalById.has(e.id))
      fail("identity-conflict", e.id, "A new lesson cannot overwrite an existing entity");
  const candidate = structuredClone(source);
  const changed = new Set([chapter.id]);
  const visitRefs = (value: unknown, visitor: (r: Ref) => void) => {
    if (!value || typeof value !== "object") return;
    if (
      !Array.isArray(value) &&
      Object.keys(value).length === 3 &&
      "kind" in value &&
      "id" in value &&
      "revision" in value
    )
      visitor(value as Ref);
    for (const child of Object.values(value)) visitRefs(child, visitor);
  };
  // Exact parent/child refs are reciprocal. Increment every existing entity whose payload
  // changes through a revised reference, including cycles, without touching its teaching text.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entity of originalEntities) {
      if (changed.has(entity.id)) continue;
      visitRefs(entity, (r) => {
        if (changed.has(r.id)) {
          changed.add(entity.id);
          expanded = true;
        }
      });
    }
  }
  const updateRef = (r: Ref) => {
    const old = originalById.get(r.id);
    if (old && changed.has(old.id)) r.revision = old.revision + 1;
  };
  for (const [key, entities] of Object.entries(addition))
    (candidate.public[key as keyof typeof addition] as unknown[]).push(
      ...structuredClone(entities),
    );
  candidate.private.grading.exerciseRules.push(...structuredClone(grading.exerciseRules));
  for (const e of [
    ...Object.values(candidate.public).flat(),
    ...candidate.private.transcripts,
    ...candidate.private.rubrics,
  ]) {
    const old = originalById.get(e.id);
    if (old && changed.has(e.id)) e.revision = old.revision + 1;
    visitRefs(e, updateRef);
  }
  const targetChapter = candidate.public.chapters.find((c) => c.id === chapter.id)!;
  // Append so the original lessons retain their relative order and assessment coverage.
  targetChapter.lessonRefs.push(ref("lesson", newLesson.id, newLesson.revision));
  targetChapter.objectiveRefs.push(...structuredClone(newLesson.objectiveRefs));
  for (const rule of candidate.private.grading.exerciseRules)
    if (changed.has(rule.exerciseRef.id)) {
      rule.gradingRevision++;
      updateRef(rule.exerciseRef);
    }
  for (const policy of candidate.private.grading.assessmentPolicies)
    if (changed.has(policy.assessmentRef.id)) {
      policy.policyRevision++;
      updateRef(policy.assessmentRef);
    }
  candidate.manifest.contentVersion = options.contentVersion;
  candidate.manifest.basedOn = {
    schemaVersion: 2,
    contentVersion: source.manifest.contentVersion,
    sha256: options.sourceDigest,
  };
  candidate.manifest.createdAt = options.createdAt;
  visitRefs(candidate.manifest.courseRefs, updateRef);
  visitRefs(candidate.manifest.legacyLocaleExceptions, updateRef);
  visitRefs(candidate.manifest.editorialApprovals, updateRef);
  // Changed revisions never inherit editorial authorization from the source package.
  candidate.manifest.editorialApprovals = candidate.manifest.editorialApprovals.filter(
    (a) => !changed.has(a.ref.id),
  );
  const byId = new Map(
    [
      ...Object.values(candidate.public).flat(),
      ...candidate.private.transcripts,
      ...candidate.private.rubrics,
    ].map((e) => [e.id, e]),
  );
  // Retain all original mappings exactly; append separate mappings scoped to the new version.
  for (const mapping of source.compatibility.filter(
    (m) => m.to.contentVersion === source.manifest.contentVersion,
  )) {
    const target = byId.get(mapping.to.ref.id)!;
    candidate.compatibility.push({
      ...structuredClone(mapping),
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      reviewStatus: "pending",
      reason:
        "Optional grammar lesson added; existing teaching and grading semantics retained. Review before activation.",
      fingerprints: { source: mapping.fingerprints.source, target: fingerprint(target) },
    });
  }
  for (const old of originalEntities) {
    const target = byId.get(old.id)!;
    candidate.compatibility.push({
      from: {
        schemaVersion: 2,
        contentVersion: source.manifest.contentVersion,
        ref: ref(old.kind, old.id, old.revision),
      },
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      completion: old.kind === "lesson" ? "carry_forward" : "archive_only",
      evidence: old.kind === "exercise" ? "equivalent" : "none",
      resume: "same_ids",
      reviewStatus: "pending",
      reason:
        "Working-copy revision references updated; prior content remains available in its immutable source package.",
      fingerprints: { source: fingerprint(old), target: fingerprint(target) },
    });
  }
  const payloads = new Map<string, unknown>();
  for (const [key, value] of Object.entries(candidate.public))
    payloads.set(`public/${key}.json`, value);
  for (const [key, value] of Object.entries(candidate.private))
    payloads.set(`private/${key}.json`, value);
  payloads.set("compatibility.json", candidate.compatibility);
  for (const file of candidate.manifest.files) {
    if (file.collection === "media") continue;
    if (!payloads.has(file.path))
      fail(
        "prototype-files",
        file.path,
        "This prototype supports the standard unsharded package layout",
      );
    const bytes = canonicalJson(payloads.get(file.path));
    file.sha256 = sha256(bytes);
    file.byteLength = Buffer.byteLength(bytes);
  }
  for (const e of addition.exercises)
    if (!candidate.manifest.requiredCapabilities.includes(e.type))
      candidate.manifest.requiredCapabilities.push(e.type);
  return candidate;
}
