// Controlled offline revision of the existing pronouns lesson; never edits a source package.
import { ref, type Ref } from "./common";
import { canonicalJson, fail, fingerprint, sha256 } from "./json";
import type { CurriculumPackage, CompatibilityEntry } from "./package";
import { gradingSchema, type GradingRule } from "./private";
import { publicCollectionsSchema, type PublicEntity } from "./public";
import type { PrototypeOptions } from "./authoring";
const pronounsId = "a1-c1-subject-pronouns";
const metaFree = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(metaFree)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(
              ([k]) => !["revision", "gradingRevision", "policyRevision", "source"].includes(k),
            )
            .map(([k, v]) => [k, metaFree(v)]),
        )
      : value;
const refs = (value: unknown, visit: (r: Ref) => void) => {
  if (!value || typeof value !== "object") return;
  if (
    !Array.isArray(value) &&
    Object.keys(value).length === 3 &&
    "kind" in value &&
    "id" in value &&
    "revision" in value
  )
    visit(value as Ref);
  for (const child of Object.values(value)) refs(child, visit);
};
const gradeMeaning = (rule: GradingRule) => {
  const { exerciseRef: _ref, gradingRevision: _revision, explanation: _feedback, ...score } = rule;
  void _ref;
  void _revision;
  void _feedback;
  return score;
};
export function revisePronounsLesson(
  source: CurriculumPackage,
  publicInput: unknown,
  gradingInput: unknown,
  options: PrototypeOptions,
): CurriculumPackage {
  if (source.manifest.state !== "draft")
    fail("draft-only", "source", "Edit a new working copy of an inactive package");
  const authored = publicCollectionsSchema.parse(publicInput);
  const grading = gradingSchema.parse(gradingInput);
  if (
    authored.lessons.length !== 1 ||
    authored.lessons[0]!.id !== pronounsId ||
    [
      authored.courses,
      authored.chapters,
      authored.assessments,
      authored.stimuli,
      authored.transcripts,
      authored.assets,
    ].some((v) => v.length) ||
    grading.assessmentPolicies.length
  )
    fail(
      "editorial-scope",
      "authoring",
      "Revise only the existing pronouns lesson, its blocks, objectives and private practice rules",
    );
  const oldLesson = source.public.lessons.find((l) => l.id === pronounsId);
  const newLesson = authored.lessons[0]!;
  if (
    !oldLesson ||
    newLesson.slug !== oldLesson.slug ||
    newLesson.chapterRef.id !== oldLesson.chapterRef.id ||
    fingerprint(newLesson.completionPolicy) !== fingerprint(oldLesson.completionPolicy)
  )
    fail(
      "editorial-identity",
      pronounsId,
      "Preserve the lesson route, parent identity and self-practice completion policy",
    );
  const ownedBlocks = source.public.blocks.filter((b) => b.lessonRef.id === pronounsId);
  const ownedExerciseIds = ownedBlocks.flatMap((b) =>
    b.type === "quiz" || b.type === "exercise_set" ? b.exerciseRefs.map((r) => r.id) : [],
  );
  const ownedIds = new Set([
    pronounsId,
    ...oldLesson.objectiveRefs.map((r) => r.id),
    ...ownedBlocks.map((b) => b.id),
    ...ownedExerciseIds,
  ]);
  const sourceEntities = Object.values(source.public).flat();
  const oldById = new Map(sourceEntities.map((e) => [e.id, e]));
  const edits = new Map<string, PublicEntity>();
  for (const e of Object.values(authored).flat()) {
    if (edits.has(e.id)) fail("duplicate-id", e.id, "Authored IDs must be unique");
    if (oldById.has(e.id) && !ownedIds.has(e.id))
      fail("editorial-scope", e.id, "Cannot edit another lesson's entity");
    const old = oldById.get(e.id);
    if (old && old.kind !== e.kind) fail("editorial-identity", e.id, "Preserve entity kinds");
    edits.set(e.id, e);
  }
  for (const id of ownedIds)
    if (!edits.has(id)) fail("editorial-deletion", id, "Existing entities must be retained");
  if (
    fingerprint([...ownedExerciseIds].sort()) !==
    fingerprint(authored.exercises.map((e) => e.id).sort())
  )
    fail("editorial-questions", "exercises", "Preserve the exact 14 practice question IDs");
  const oldRules = new Map(source.private.grading.exerciseRules.map((r) => [r.exerciseRef.id, r]));
  const newRules = new Map(grading.exerciseRules.map((r) => [r.exerciseRef.id, r]));
  if (
    newRules.size !== grading.exerciseRules.length ||
    fingerprint([...newRules.keys()].sort()) !== fingerprint([...ownedExerciseIds].sort())
  )
    fail("editorial-keys", "grading", "Provide exactly one rule for each preserved question");
  const changed = new Set<string>();
  for (const e of edits.values()) {
    const old = oldById.get(e.id);
    if (old && fingerprint(e) !== fingerprint(old)) changed.add(e.id);
  }
  for (const [id, rule] of newRules) {
    const old = oldRules.get(id)!;
    if (fingerprint(gradeMeaning(old)) !== fingerprint(gradeMeaning(rule)))
      fail(
        "editorial-keys",
        id,
        "Correct answers, grader algorithm, points and scoring must remain unchanged",
      );
    const oldExercise = oldById.get(id);
    const editedExercise = edits.get(id);
    if (
      oldExercise?.kind !== "exercise" ||
      oldExercise.type !== "multiple_choice" ||
      editedExercise?.kind !== "exercise" ||
      editedExercise.type !== "multiple_choice" ||
      old.type !== "multiple_choice"
    )
      fail("editorial-questions", id, "Keep all multiple-choice formats");
    if (
      fingerprint(oldExercise.options.map((o) => o.id)) !==
      fingerprint(editedExercise.options.map((o) => o.id))
    )
      fail("editorial-keys", id, "Preserve option identities and order");
    for (const key of old.correctOptionIds)
      if (
        fingerprint(oldExercise.options.find((o) => o.id === key)) !==
        fingerprint(editedExercise.options.find((o) => o.id === key))
      )
        fail("editorial-keys", id, "Correct option text must remain unchanged");
    if (fingerprint(rule) !== fingerprint(old)) changed.add(id);
  }
  // Propagate changed exact references until the reciprocal hierarchy reaches a fixed point.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const old of sourceEntities) {
      if (changed.has(old.id)) continue;
      refs(edits.get(old.id) ?? old, (r) => {
        if (changed.has(r.id)) {
          changed.add(old.id);
          expanded = true;
        }
      });
    }
  }
  const updateRef = (r: Ref) => {
    const old = oldById.get(r.id);
    if (old && changed.has(old.id)) r.revision = old.revision + 1;
  };
  const candidate = structuredClone(source);
  for (const [collection, values] of Object.entries(authored)) {
    const target = candidate.public[collection as keyof typeof authored] as PublicEntity[];
    for (const e of values) {
      const index = target.findIndex((old) => old.id === e.id);
      if (index < 0) target.push(structuredClone(e));
      else target[index] = structuredClone(e);
    }
  }
  for (const e of Object.values(candidate.public).flat()) {
    const old = oldById.get(e.id);
    const authoredEntity = edits.get(e.id);
    const requiredRevision = old ? old.revision + (changed.has(e.id) ? 1 : 0) : 1;
    if (authoredEntity && authoredEntity.revision !== requiredRevision)
      fail("editorial-revision", e.id, `Authored revision must be ${requiredRevision}`);
    e.revision = requiredRevision;
    refs(e, updateRef);
  }
  const chapter = candidate.public.chapters.find((c) => c.id === newLesson.chapterRef.id)!;
  for (const objective of newLesson.objectiveRefs)
    if (!chapter.objectiveRefs.some((r) => r.id === objective.id))
      chapter.objectiveRefs.push(structuredClone(objective));
  for (const [i, old] of candidate.private.grading.exerciseRules.entries()) {
    const edited = newRules.get(old.exerciseRef.id);
    if (edited) {
      const expected = oldRules.get(old.exerciseRef.id)!.gradingRevision + 1;
      if (edited.gradingRevision !== expected)
        fail(
          "editorial-revision",
          old.exerciseRef.id,
          `Private grading revision must be ${expected}`,
        );
      candidate.private.grading.exerciseRules[i] = structuredClone(edited);
      updateRef(candidate.private.grading.exerciseRules[i]!.exerciseRef);
    }
  }
  for (const policy of candidate.private.grading.assessmentPolicies)
    if (changed.has(policy.assessmentRef.id)) {
      policy.policyRevision++;
      updateRef(policy.assessmentRef);
    }
  candidate.manifest.contentVersion = options.contentVersion;
  candidate.manifest.createdAt = options.createdAt;
  candidate.manifest.basedOn = {
    schemaVersion: 2,
    contentVersion: source.manifest.contentVersion,
    sha256: options.sourceDigest,
  };
  refs(candidate.manifest.courseRefs, updateRef);
  refs(candidate.manifest.legacyLocaleExceptions, updateRef);
  candidate.manifest.editorialApprovals = candidate.manifest.editorialApprovals.filter(
    (a) => !changed.has(a.ref.id),
  );
  const newById = new Map(
    Object.values(candidate.public)
      .flat()
      .map((e) => [e.id, e]),
  );
  const classification = (
    target: PublicEntity,
  ): Pick<CompatibilityEntry, "completion" | "evidence" | "resume" | "reason"> => {
    const old = oldById.get(target.id)!;
    const teachingSame = fingerprint(metaFree(old)) === fingerprint(metaFree(target));
    return {
      completion:
        target.kind === "lesson"
          ? teachingSame
            ? "carry_forward"
            : "requires_recompletion"
          : "archive_only",
      evidence:
        target.kind === "exercise" ? (teachingSame ? "equivalent" : "not_equivalent") : "none",
      resume: teachingSame ? "same_ids" : "restart_with_notice",
      reason: teachingSame
        ? "Only exact reference revisions changed; original teaching and scoring preserved. Pending review."
        : "Editorial payload changed; preserve historical results and require review of new practice/evidence. No automatic carry-forward.",
    };
  };
  for (const mapping of source.compatibility.filter(
    (m) => m.to.contentVersion === source.manifest.contentVersion,
  )) {
    const target = newById.get(mapping.to.ref.id)!;
    candidate.compatibility.push({
      ...structuredClone(mapping),
      ...classification(target),
      to: {
        contentVersion: options.contentVersion,
        ref: ref(target.kind, target.id, target.revision),
      },
      reviewStatus: "pending",
      fingerprints: { source: mapping.fingerprints.source, target: fingerprint(target) },
    });
  }
  for (const old of sourceEntities) {
    const target = newById.get(old.id)!;
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
      ...classification(target),
      reviewStatus: "pending",
      fingerprints: { source: fingerprint(old), target: fingerprint(target) },
    });
  }
  for (const file of candidate.manifest.files) {
    if (file.collection === "media") continue;
    const payload =
      file.collection === "compatibility"
        ? candidate.compatibility
        : file.visibility === "private"
          ? candidate.private[file.collection as keyof typeof candidate.private]
          : candidate.public[file.collection as keyof typeof candidate.public];
    const bytes = canonicalJson(payload);
    file.sha256 = sha256(bytes);
    file.byteLength = Buffer.byteLength(bytes);
  }
  return candidate;
}
