import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import raw from "@/content/v1/curriculum.json";
import { curriculumSchema } from "@/lib/curriculum/schema";
import {
  courses,
  firstChapter,
  firstLesson,
  getChapter,
  getCourse,
  getLesson,
  lessonHref,
} from "@/lib/curriculum";

describe("versioned curriculum", () => {
  it("keeps answer keys and quiz explanations out of public lesson payloads", () => {
    const quiz = firstChapter.lessons[2]!.blocks.find((b) => b.type === "quiz")!;
    for (const question of quiz.questions) {
      expect(question).not.toHaveProperty("correctOptionId");
      expect(question).not.toHaveProperty("explanation");
    }
  });
  it("contains five CEFR levels and only exposes ready A1 content", () => {
    expect(courses.map((course) => course.level)).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    expect(courses.filter((course) => course.status === "available")).toHaveLength(1);
    expect(firstChapter.lessons).toHaveLength(3);
    expect(courses.slice(1).every((course) => course.chapters.length === 0)).toBe(true);
  });
  it("has all four skills, bilingual learning notes, and real local audio", () => {
    expect(new Set(firstChapter.lessons.flatMap((lesson) => lesson.skills))).toEqual(
      new Set(["listening", "speaking", "reading", "writing"]),
    );
    for (const lesson of firstChapter.lessons) {
      expect(lesson.description.my).toMatch(/[\u1000-\u109f]/);
      for (const block of lesson.blocks)
        if (block.type === "listening")
          expect(existsSync(resolve("public", block.audio.slice(1)))).toBe(true);
    }
  });
  it("rejects broken answer keys, duplicate IDs, incompatible versions, and invalid routes", () => {
    const duplicate = structuredClone(raw);
    duplicate.courses[0]!.chapters[0]!.lessons[1]!.id = firstLesson.id;
    expect(curriculumSchema.safeParse(duplicate).success).toBe(false);
    const answer = structuredClone(raw);
    const quiz = answer.courses[0]!.chapters[0]!.lessons[2]!.blocks[0]!;
    if ("questions" in quiz && quiz.questions)
      quiz.questions[0]!.correctOptionId = "missing-option";
    expect(curriculumSchema.safeParse(answer).success).toBe(false);
    expect(curriculumSchema.safeParse({ ...raw, schemaVersion: 2 }).success).toBe(false);
    const route = structuredClone(raw);
    route.courses[0]!.slug = "../../bad";
    expect(curriculumSchema.safeParse(route).success).toBe(false);
  });
  it("rejects planned courses with playable chapters and duplicate sibling slugs", () => {
    const planned = structuredClone(raw);
    planned.courses[0]!.status = "planned";
    expect(curriculumSchema.safeParse(planned).success).toBe(false);
    const slugs = structuredClone(raw);
    slugs.courses[0]!.chapters[0]!.lessons[1]!.slug = firstLesson.slug;
    expect(curriculumSchema.safeParse(slugs).success).toBe(false);
  });
  it("resolves routes in their parent scope and returns undefined for unknown content", () => {
    expect(getLesson("a1", firstChapter.slug, firstLesson.slug)?.id).toBe(firstLesson.id);
    expect(getLesson("a2", firstChapter.slug, firstLesson.slug)).toBeUndefined();
    expect(getChapter("a1", "missing")).toBeUndefined();
    expect(getCourse("missing")).toBeUndefined();
    expect(lessonHref(courses[0]!, firstChapter, firstLesson)).toBe(
      "/courses/a1/chapters/first-conversations/lessons/introductions",
    );
  });
});
