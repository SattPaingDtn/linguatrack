// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ref } from "../../src/lib/curriculum/v2/common";
import type { Exercise } from "../../src/lib/curriculum/v2/public";
import type { GradingRule } from "../../src/lib/curriculum/v2/private";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import { bridge, options, translated } from "./fixtures";
function fullExerciseFixture() {
  const pkg = bridge();
  const original = pkg.public.exercises[0]!;
  const base = (id: string) => ({
    kind: "exercise" as const,
    id,
    revision: 1,
    instructions: translated,
    tags: original.tags,
    difficulty: original.difficulty,
    objectiveRefs: original.objectiveRefs,
  });
  const option = (id: string, text: string) => ({ id, text: { language: "en" as const, text } });
  const exercises: Exercise[] = [
    {
      ...base("match"),
      type: "matching",
      mode: "one_to_one",
      left: [option("left-a", "I")],
      right: [option("right-a", "am"), option("distractor", "is")],
    },
    {
      ...base("blank"),
      type: "fill_in_blank",
      segments: [
        { type: "text", text: "I " },
        { type: "blank", id: "verb" },
        { type: "text", text: " Su." },
      ],
    },
    {
      ...base("order"),
      type: "sentence_ordering",
      tokens: [option("subject", "I"), option("verb", "am")],
    },
    {
      ...base("essay"),
      type: "writing_submission",
      prompt: translated,
      limits: { minWords: 10, maxWords: 40, maxChars: 1000 },
    },
    {
      ...base("record"),
      type: "speaking_recording",
      prompt: translated,
      limits: { minSeconds: 1, maxSeconds: 30, maxBytes: 100_000, mimeTypes: ["audio/webm"] },
    },
    {
      ...base("read-group"),
      type: "reading_comprehension",
      stimulusRef: ref("stimulus", "a1-c1-dialogue-stimulus"),
      itemRefs: [ref("exercise", "match")],
      assistance: "independent",
    },
    {
      ...base("listen-group"),
      type: "listening_comprehension",
      stimulusRef: ref("stimulus", "a1-c1-listen-stimulus"),
      itemRefs: [ref("exercise", "blank")],
      assistance: "practice_with_support",
    },
  ];
  const ruleBase = (id: string) => ({
    exerciseRef: ref("exercise", id),
    gradingRevision: 1,
    graderVersion: "fixture-v1",
    maxPoints: 1,
    explanation: translated,
  });
  const rules: GradingRule[] = [
    {
      ...ruleBase("match"),
      type: "matching",
      acceptedPairs: [{ leftId: "left-a", rightId: "right-a" }],
      scoring: "per_pair",
    },
    {
      ...ruleBase("blank"),
      type: "fill_in_blank",
      acceptedByBlank: [{ blankId: "verb", variants: ["am"] }],
      normalizerVersion: "en-nfc-trim-ascii-space-casefold-v1",
      scoring: "per_blank",
    },
    {
      ...ruleBase("order"),
      type: "sentence_ordering",
      acceptedOrders: [["subject", "verb"]],
      scoring: "exact_sequence",
    },
    {
      ...ruleBase("essay"),
      type: "writing_submission",
      method: "human_rubric",
      rubricRef: ref("rubric", "writing-rubric"),
      wordCounterVersion: "en-apostrophe-hyphen-v1",
      modelResponse: option("model", "My name is Su.").text,
      markingNotes: translated,
    },
    {
      ...ruleBase("record"),
      type: "speaking_recording",
      method: "human_rubric",
      rubricRef: ref("rubric", "speaking-rubric"),
      modelResponse: option("model", "My name is Su.").text,
      markingNotes: translated,
    },
  ];
  pkg.public.exercises.push(...exercises);
  pkg.private.grading.exerciseRules.push(...rules);
  for (const skill of ["writing", "speaking"] as const)
    pkg.private.rubrics.push({
      kind: "rubric",
      id: `${skill}-rubric`,
      revision: 1,
      coreSkill: skill,
      title: translated,
      criteria: [
        {
          id: "communication",
          description: translated,
          maxPoints: 1,
          anchors: [
            { points: 0, description: translated },
            { points: 1, description: translated },
          ],
        },
      ],
      aggregation: "sum_integer_points",
    });
  pkg.manifest.requiredCapabilities.push(
    "matching",
    "fill_in_blank",
    "sentence_ordering",
    "writing_submission",
    "speaking_recording",
    "reading_comprehension",
    "listening_comprehension",
    "human-rubric",
  );
  // A separate practice delivery avoids double-counting comprehension leaves.
  pkg.public.blocks.push({
    kind: "block",
    id: "new-practice",
    revision: 1,
    lessonRef: ref("lesson", "a1-c1-be"),
    type: "exercise_set",
    title: translated,
    exerciseRefs: [
      ref("exercise", "read-group"),
      ref("exercise", "listen-group"),
      ref("exercise", "order"),
      ref("exercise", "essay"),
      ref("exercise", "record"),
    ],
  });
  pkg.public.lessons[1]!.blockRefs.push(ref("block", "new-practice"));
  // This fixture expands the lesson, so it explicitly withdraws its old carry-forward mapping.
  pkg.compatibility = pkg.compatibility.filter((m) => m.to.ref.id !== "a1-c1-be");
  return pkg;
}
describe("all eight exercise contracts", () => {
  it("validates typed keys, rubrics, support and comprehension without enabling grading/UIs", () => {
    expect(
      validatePackage(fullExerciseFixture(), options).public.exercises.map((e) => e.type),
    ).toEqual(
      expect.arrayContaining([
        "multiple_choice",
        "matching",
        "fill_in_blank",
        "sentence_ordering",
        "reading_comprehension",
        "listening_comprehension",
        "writing_submission",
        "speaking_recording",
      ]),
    );
  });
  it.each(["matching", "fill_in_blank", "sentence_ordering"])(
    "rejects foreign or incomplete %s keys",
    (type) => {
      const pkg = fullExerciseFixture();
      const rule = pkg.private.grading.exerciseRules.find((r) => r.type === type)!;
      if (rule.type === "matching") rule.acceptedPairs[0]!.rightId = "foreign";
      if (rule.type === "fill_in_blank") rule.acceptedByBlank[0]!.blankId = "foreign";
      if (rule.type === "sentence_ordering") rule.acceptedOrders[0] = ["subject", "subject"];
      expect(() => validatePackage(pkg, options)).toThrow(/answer-key/);
    },
  );
  it("rejects duplicate normalized variants, nested containers and falsely independent audio", () => {
    const pkg = fullExerciseFixture();
    const rule = pkg.private.grading.exerciseRules.find((r) => r.type === "fill_in_blank")!;
    if (rule.type === "fill_in_blank") rule.acceptedByBlank[0]!.variants.push(" AM ");
    expect(() => validatePackage(pkg, options)).toThrow(/duplicate/);
    const group = pkg.public.exercises.find((e) => e.id === "read-group")!;
    if (group.type === "reading_comprehension") group.itemRefs = [ref("exercise", "listen-group")];
    expect(() => validatePackage(pkg, options)).toThrow(/comprehension-leaf/);
    const listening = pkg.public.exercises.find((e) => e.id === "listen-group")!;
    if (listening.type === "listening_comprehension") listening.assistance = "independent";
    expect(() => validatePackage(pkg, options)).toThrow(/independent-support/);
  });
  it("rejects private transcript leaks and broken rubric scales/bindings", () => {
    const pkg = fullExerciseFixture();
    const stimulus = pkg.public.stimuli.find((s) => s.type === "listening")!;
    if (stimulus.type === "listening") stimulus.transcriptAccess = "after_submission";
    expect(() => validatePackage(pkg, options)).toThrow(/public-transcript-leak/);
    pkg.private.rubrics[0]!.criteria[0]!.maxPoints = 2;
    expect(() => validatePackage(pkg, options)).toThrow(/rubric-scale/);
    pkg.private.rubrics[1]!.coreSkill = "writing";
    expect(() => validatePackage(pkg, options)).toThrow(/rubric-binding/);
  });
});
