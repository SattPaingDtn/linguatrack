// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ref } from "../../src/lib/curriculum/v2/common";
import { ContentValidationError, parseJson } from "../../src/lib/curriculum/v2/json";
import { publicProjection } from "../../src/lib/curriculum/v2/projection";
import { publicCollectionsSchema } from "../../src/lib/curriculum/v2/public";
import { registrySnapshot, validatePackage } from "../../src/lib/curriculum/v2/validate";
import { bridge, options, refreshMappings } from "./fixtures";
function rejects(mutate: (p: ReturnType<typeof bridge>) => void, code: string) {
  const p = bridge();
  mutate(p);
  try {
    validatePackage(p, options);
    expect.fail("Invalid package passed");
  } catch (e) {
    expect(e).toBeInstanceOf(ContentValidationError);
    expect((e as ContentValidationError).diagnostics.some((d) => d.code === code)).toBe(true);
  }
}
describe("strict contracts and semantic validation", () => {
  it("rejects unknown fields and public answer keys, rubrics and assessment models", () => {
    const pkg = bridge();
    const projection = publicProjection(pkg);
    const serialized = JSON.stringify(projection);
    for (const value of [
      "correctOptionIds",
      "correctOptionId",
      "acceptedPairs",
      "markingNotes",
      "private/grading",
      "fingerprints",
      "exerciseRules",
    ])
      expect(serialized).not.toContain(value);
    for (const field of [
      "correctOptionIds",
      "correctOptionId",
      "explanation",
      "modelResponse",
      "rubricRef",
    ]) {
      const pub = structuredClone(pkg.public);
      Object.assign(pub.exercises[0]!, { [field]: "secret" });
      expect(publicCollectionsSchema.safeParse(pub).success).toBe(false);
    }
    const unsafe = structuredClone(pkg);
    Object.assign(unsafe.public.blocks[0]!, { acceptedOrders: ["secret"] });
    expect(() => publicProjection(unsafe)).toThrow();
  });
  it("rejects unresolved, stale-revision, wrong-kind and wrong-parent references", () => {
    rejects((p) => {
      p.public.lessons[0]!.blockRefs[0]!.id = "missing-block";
    }, "reference");
    rejects((p) => {
      p.public.lessons[0]!.blockRefs[0]!.revision = 2;
    }, "reference");
    rejects((p) => {
      p.public.lessons[0]!.chapterRef = ref("chapter", "general-a1");
    }, "reference");
    rejects((p) => {
      p.public.blocks[0]!.lessonRef = ref("lesson", "a1-c1-be");
    }, "ownership");
  });
  it("rejects duplicate entity/option IDs, unknown keys, missing rules and missing policies", () => {
    rejects((p) => {
      p.public.exercises.push(p.public.exercises[0]!);
    }, "duplicate-id");
    rejects((p) => {
      const e = p.public.exercises[0]!;
      if (e.type === "multiple_choice") e.options[1]!.id = e.options[0]!.id;
    }, "duplicate");
    rejects((p) => {
      const r = p.private.grading.exerciseRules[0]!;
      if (r.type === "multiple_choice") r.correctOptionIds = ["unknown"];
    }, "answer-key");
    rejects((p) => {
      p.private.grading.exerciseRules.pop();
    }, "missing-rule");
    rejects((p) => {
      p.private.grading.assessmentPolicies = [];
    }, "missing-policy");
  });
  it("rejects a completion gate on itself, inconsistent assessment leaves and false coverage claims", () => {
    rejects((p) => {
      p.public.assessments[0]!.prerequisites = [
        { requirement: "completed", target: ref("lesson", "a1-c1-check"), enforcement: "required" },
      ];
    }, "prerequisite-cycle");
    rejects((p) => {
      p.public.chapters[0]!.prerequisites = [
        { requirement: "completed", target: ref("lesson", "a1-c1-be"), enforcement: "required" },
      ];
    }, "prerequisite-cycle");
    rejects((p) => {
      p.private.grading.assessmentPolicies[0]!.requiredItems.pop();
    }, "assessment-policy");
    rejects((p) => {
      p.public.courses[0]!.coverageState = "complete";
    }, "coverage");
    rejects((p) => {
      p.public.assessments[0]!.declaredCoverage = [
        {
          area: "speaking",
          evidenceKind: "recognition",
          objectiveRefs: p.public.lessons[2]!.objectiveRefs,
          minimumDistinctItems: 1,
        },
      ];
    }, "coverage-evidence");
    rejects((p) => {
      p.public.assessments[0]!.declaredCoverage = [
        {
          area: "writing",
          evidenceKind: "written_production",
          objectiveRefs: p.public.lessons[2]!.objectiveRefs,
          minimumDistinctItems: 1,
        },
      ];
    }, "coverage");
  });
  it("requires exact source-backed locale exceptions and refuses unsupported editions", () => {
    rejects((p) => {
      p.manifest.legacyLocaleExceptions.pop();
    }, "legacy-locale");
    rejects((p) => {
      const title = p.public.courses[0]!.title;
      if ("legacy" in title) title.text = "Invented";
    }, "legacy-text");
    rejects((p) => {
      p.manifest.basedOn.sha256 = "0".repeat(64);
    }, "legacy-baseline");
    const pkg = bridge();
    Object.assign(pkg.manifest, { contractVersion: "2.1.0" });
    expect(() => validatePackage(pkg, options)).toThrow(ContentValidationError);
    rejects((p) => {
      p.manifest.contentVersion = "1.0.0";
    }, "version-conflict");
    rejects((p) => {
      p.manifest.state = "sealed";
    }, "editorial-review");
  });
  it("detects changed entity revisions, grading revisions, policies and reused release versions", () => {
    const original = bridge();
    const registry = registrySnapshot(original);
    expect(() => validatePackage(original, { ...options, registry })).not.toThrow();
    const changed = bridge();
    changed.public.lessons[0]!.slug = "changed";
    refreshMappings(changed);
    expect(() => validatePackage(changed, { ...options, registry })).toThrow(/release-conflict/);
    changed.manifest.contentVersion = "1.2.0";
    for (const m of changed.compatibility) m.to.contentVersion = "1.2.0";
    expect(() => validatePackage(changed, { ...options, registry })).toThrow(/revision-conflict/);
    const changedKey = bridge();
    changedKey.manifest.contentVersion = "1.2.0";
    for (const m of changedKey.compatibility) m.to.contentVersion = "1.2.0";
    const rule = changedKey.private.grading.exerciseRules[0]!;
    if (rule.type === "multiple_choice") rule.correctOptionIds = ["option-2"];
    expect(() => validatePackage(changedKey, { ...options, registry })).toThrow(/grading-conflict/);
    const changedPolicy = bridge();
    changedPolicy.private.grading.assessmentPolicies[0]!.passPercent = 60;
    expect(() => validatePackage(changedPolicy, { ...options, registry })).toThrow(
      /policy-conflict/,
    );
  });
  it("rejects duplicate JSON keys (including escaped aliases), deep input and unsafe paths", () => {
    expect(() => parseJson('{"id":"first","\\u0069d":"second"}', "exercise.json")).toThrow(
      /duplicate-json-key/,
    );
    expect(() => parseJson("[".repeat(34) + "0" + "]".repeat(34), "deep.json")).toThrow(
      /json-depth/,
    );
    expect(() => parseJson('{"id":1,}', "invalid.json")).toThrow(/invalid-json/);
    rejects((p) => {
      p.manifest.files[0]!.path = "../grading.json";
    }, "schema");
    rejects((p) => {
      p.manifest.files[0]!.visibility = "private";
    }, "visibility");
  });
});
