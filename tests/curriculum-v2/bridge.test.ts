// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertV1 } from "../../src/lib/curriculum/v2/bridge";
import { ref } from "../../src/lib/curriculum/v2/common";
import { canonicalJson } from "../../src/lib/curriculum/v2/json";
import {
  gradeLegacyBridge,
  legacyAssessmentRef,
  checkCompletedLessons,
  checkLegacyAttempt,
  checkResumeCompatibility,
} from "../../src/lib/curriculum/v2/compatibility";
import { validatePackage } from "../../src/lib/curriculum/v2/validate";
import { gradeQuiz } from "../../src/lib/quiz";
import { canonical, canonicalQuiz, gradedResponse, input, savedAttempt } from "../fixtures";
import { bridge, legacy, options, media, refreshMappings, translated } from "./fixtures";

describe("deterministic, backwards-compatible v1 bridge", () => {
  it("preserves every legacy ID, slug, ordered parent/block, option, answer and explanation", () => {
    const pkg = validatePackage(bridge(), options);
    expect(canonicalJson(pkg)).toBe(
      canonicalJson(convertV1(legacy, { sourceHash: options.legacyHash, media })),
    );
    expect(pkg.manifest).toMatchObject({
      state: "draft",
      contentVersion: "1.1.0",
      cefrAwarding: "disabled",
      editorialApprovals: [],
    });
    for (const course of canonical.courses) {
      const c = pkg.public.courses.find((c) => c.id === course.id)!;
      expect(c.slug).toBe(course.slug);
      expect(c.chapterRefs.map((r) => r.id)).toEqual(course.chapters.map((ch) => ch.id));
      expect(c.coverageState).toBe("partial");
      expect(c.status).toBe(course.status);
      for (const chapter of course.chapters) {
        const ch = pkg.public.chapters.find((ch) => ch.id === chapter.id)!;
        expect(ch.slug).toBe(chapter.slug);
        expect(ch.courseRef.id).toBe(course.id);
        expect(ch.lessonRefs.map((r) => r.id)).toEqual(chapter.lessons.map((l) => l.id));
        for (const lesson of chapter.lessons) {
          const l = pkg.public.lessons.find((l) => l.id === lesson.id)!;
          expect(l.slug).toBe(lesson.slug);
          expect(l.chapterRef.id).toBe(chapter.id);
          expect(l.blockRefs.map((r) => r.id)).toEqual(lesson.blocks.map((b) => b.id));
          for (const block of lesson.blocks) {
            const b = pkg.public.blocks.find((b) => b.id === block.id)!;
            expect(b.lessonRef.id).toBe(lesson.id);
            expect(b.type).toBe(block.type);
            if (block.type === "quiz") {
              expect(b.type === "quiz" && b.exerciseRefs.map((r) => r.id)).toEqual(
                block.questions.map((q) => q.id),
              );
              for (const q of block.questions) {
                const e = pkg.public.exercises.find((e) => e.id === q.id)!;
                const rule = pkg.private.grading.exerciseRules.find(
                  (r) => r.exerciseRef.id === q.id,
                )!;
                expect(
                  e.type === "multiple_choice" &&
                    e.options.map((o) => ({ id: o.id, text: o.text.text })),
                ).toEqual(q.options);
                expect(e.type === "multiple_choice" && e.prompt.text).toBe(q.prompt);
                expect(rule.type === "multiple_choice" && rule.correctOptionIds).toEqual([
                  q.correctOptionId,
                ]);
                expect(rule.explanation).toEqual(q.explanation);
              }
              expect(pkg.private.grading.assessmentPolicies[0]?.passPercent).toBe(
                block.passingPercent,
              );
            }
          }
        }
      }
    }
    expect(pkg.public.lessons.map((l) => l.completionPolicy.type)).toEqual([
      "self_reported",
      "self_reported",
      "assessment_pass",
    ]);
    expect(pkg.public.assets[0]?.legacyPublicPath).toBe("/audio/a1-introductions.wav");
    expect(pkg.public.exercises.find((e) => e.id === "a1-c1-q5")?.tags).toEqual({
      areas: ["writing"],
      coreSkills: [],
    });
    expect(pkg.compatibility.every((m) => m.reviewStatus === "pending")).toBe(true);
  });
  it("matches v1 grading for every combination of correct, wrong, missing and foreign options", () => {
    const pkg = bridge();
    // 5^5 cases: each real option, omitted response, and invalid/foreign selection.
    for (let n = 0; n < 3125; n++) {
      let remaining = n;
      const answers: Record<string, string> = { unrelated: "option-1" };
      for (const q of canonicalQuiz.questions) {
        const selection = remaining % 5;
        remaining = Math.floor(remaining / 5);
        if (selection < 3) answers[q.id] = q.options[selection]!.id;
        else if (selection === 4) answers[q.id] = "foreign";
      }
      expect(gradeLegacyBridge(pkg, legacyAssessmentRef, answers)).toEqual(
        gradeQuiz(canonicalQuiz.questions, answers, canonicalQuiz.passingPercent),
      );
    }
  });
  it("retains historical completed and in-progress snapshots and resume anchors without mutation", () => {
    const pkg = bridge();
    const partial = savedAttempt();
    const complete = savedAttempt(
      crypto.randomUUID(),
      canonicalQuiz.questions.map((q) =>
        gradedResponse({ ...input, questionId: q.id, optionId: q.correctOptionId }),
      ),
    );
    const before = canonicalJson([partial, complete]);
    expect(checkLegacyAttempt(legacy, pkg, pkg, partial)).toEqual({
      compatible: true,
      reasons: [],
      approved: false,
    });
    expect(checkLegacyAttempt(legacy, pkg, pkg, complete)).toEqual({
      compatible: true,
      reasons: [],
      approved: false,
    });
    expect(
      checkCompletedLessons(pkg, pkg, ["a1-c1-introductions", "a1-c1-be", "a1-c1-check"]).every(
        (r) => r.compatible && !r.approved,
      ),
    ).toBe(true);
    expect(
      checkResumeCompatibility(pkg, pkg, {
        contentVersion: "1.0.0",
        lessonId: "a1-c1-introductions",
        blockId: "a1-c1-listen",
      }),
    ).toMatchObject({ compatible: true });
    expect(canonicalJson([partial, complete])).toBe(before);
    expect(
      checkResumeCompatibility(pkg, pkg, {
        contentVersion: "1.0.0",
        lessonId: "a1-c1-be",
        blockId: "a1-c1-listen",
      }),
    ).toMatchObject({ compatible: false });
  });
  it("rejects changed prompts, keys, policies, routes, source versions and corrupt historical scores", () => {
    const pkg = bridge();
    const changed = structuredClone(pkg);
    const rule = changed.private.grading.exerciseRules[0]!;
    if (rule.type === "multiple_choice") rule.correctOptionIds = ["option-2"];
    expect(checkCompletedLessons(pkg, changed, ["a1-c1-check"])[0]?.compatible).toBe(false);
    changed.private.grading.exerciseRules = pkg.private.grading.exerciseRules;
    changed.private.grading.assessmentPolicies[0]!.passPercent = 60;
    expect(checkLegacyAttempt(legacy, pkg, changed, savedAttempt()).compatible).toBe(false);
    const corrupt = savedAttempt();
    corrupt.percentage = 100;
    expect(checkLegacyAttempt(legacy, pkg, pkg, corrupt).compatible).toBe(false);
    const wrongVersion = savedAttempt();
    wrongVersion.contentVersion = "0.9.0";
    expect(checkLegacyAttempt(legacy, pkg, pkg, wrongVersion).compatible).toBe(false);
    const badSnapshot = savedAttempt();
    badSnapshot.responses[0]!.explanation.en = "Altered";
    expect(checkLegacyAttempt(legacy, pkg, pkg, badSnapshot).compatible).toBe(false);
    const duplicate = savedAttempt();
    duplicate.responses.push(duplicate.responses[0]!);
    expect(checkLegacyAttempt(legacy, pkg, pkg, duplicate).compatible).toBe(false);
    const moved = bridge();
    moved.public.courses[0]!.slug = "moved-a1";
    expect(checkCompletedLessons(pkg, moved, ["a1-c1-be"])[0]?.compatible).toBe(false);
  });
  it("keeps A1 completion compatible when A2 gains content; approval remains separate", () => {
    const baseline = bridge();
    const candidate = bridge();
    candidate.public.courses[1]!.status = "available";
    candidate.public.courses[1]!.chapterRefs = [ref("chapter", "a2-chapter-1")];
    candidate.public.objectives.push({
      kind: "objective",
      id: "a2-objective",
      revision: 1,
      statement: translated,
      successCriterion: translated,
      action: "recognize",
      tags: { areas: ["grammar"], coreSkills: [] },
      expectedEvidence: ["recognition"],
      difficulty: {
        targetCefr: "A2",
        band: "introductory",
        estimateSource: "author",
        estimatedMinutes: 1,
      },
      descriptorRefs: [],
    });
    candidate.public.chapters.push({
      kind: "chapter",
      id: "a2-chapter-1",
      revision: 1,
      courseRef: ref("course", "general-a2"),
      slug: "everyday-life",
      order: 1,
      title: translated,
      description: translated,
      objectiveRefs: [ref("objective", "a2-objective")],
      prerequisites: [],
      lessonRefs: [ref("lesson", "a2-lesson-1")],
      assessmentRefs: [],
      coverageTargets: [],
    });
    candidate.public.lessons.push({
      kind: "lesson",
      id: "a2-lesson-1",
      revision: 1,
      chapterRef: ref("chapter", "a2-chapter-1"),
      slug: "routine",
      title: translated,
      description: translated,
      tags: { areas: ["grammar"], coreSkills: [] },
      difficulty: {
        targetCefr: "A2",
        band: "introductory",
        estimateSource: "author",
        estimatedMinutes: 5,
      },
      objectiveRefs: [ref("objective", "a2-objective")],
      prerequisites: [],
      blockRefs: [ref("block", "a2-block")],
      completionPolicy: { type: "self_reported" },
    });
    candidate.public.blocks.push({
      kind: "block",
      id: "a2-block",
      revision: 1,
      lessonRef: ref("lesson", "a2-lesson-1"),
      title: translated,
      type: "explanation",
      body: translated,
      examples: [],
    });
    refreshMappings(candidate);
    validatePackage(candidate, options);
    expect(checkCompletedLessons(baseline, candidate, ["a1-c1-check"])[0]).toMatchObject({
      compatible: true,
      approved: false,
    });
  });
});
