import { z } from "zod";

export const skillSchema = z.enum(["listening", "speaking", "reading", "writing"]);
export const areaSchema = z.enum([
  "listening",
  "speaking",
  "reading",
  "writing",
  "grammar",
  "vocabulary",
]);
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const localized = z.object({ en: text, my: text }).strict();
const baseBlock = { id, title: text };
const optionSchema = z.object({ id, text }).strict();
export const questionSchema = z
  .object({
    id,
    prompt: text,
    skill: areaSchema,
    options: z.array(optionSchema).min(2).max(6),
    correctOptionId: id,
    explanation: localized,
  })
  .strict()
  .superRefine((question, ctx) => {
    if (new Set(question.options.map((o) => o.id)).size !== question.options.length)
      ctx.addIssue({ code: "custom", message: "Option IDs must be unique" });
    if (!question.options.some((o) => o.id === question.correctOptionId))
      ctx.addIssue({ code: "custom", message: "Correct option must exist" });
  });

export const blockSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...baseBlock,
      type: z.literal("explanation"),
      body: localized,
      examples: z.array(text),
    })
    .strict(),
  z
    .object({
      ...baseBlock,
      type: z.literal("grammar"),
      rule: localized,
      examples: z
        .array(z.object({ pattern: text, example: text, translation: text }).strict())
        .min(1),
    })
    .strict(),
  z
    .object({
      ...baseBlock,
      type: z.literal("vocabulary"),
      words: z
        .array(z.object({ word: text, pronunciation: text, meaning: text, example: text }).strict())
        .min(1),
    })
    .strict(),
  z
    .object({ ...baseBlock, type: z.literal("reading"), passage: text, explanation: localized })
    .strict(),
  z
    .object({
      ...baseBlock,
      type: z.literal("listening"),
      audio: z.string().regex(/^\/audio\/[a-z0-9-]+\.(wav|mp3|ogg)$/),
      transcript: text,
      instruction: localized,
    })
    .strict(),
  z
    .object({
      ...baseBlock,
      type: z.literal("speaking"),
      prompt: localized,
      modelAnswer: text,
      checklist: z.array(text).min(1),
    })
    .strict(),
  z
    .object({
      ...baseBlock,
      type: z.literal("writing"),
      prompt: localized,
      modelAnswer: text,
      minWords: z.number().int().positive(),
      maxWords: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...baseBlock,
      type: z.literal("quiz"),
      passingPercent: z.number().int().min(1).max(100),
      questions: z.array(questionSchema).min(1),
    })
    .strict(),
]);

export const lessonSchema = z
  .object({
    id,
    slug: id,
    title: text,
    description: localized,
    durationMinutes: z.number().int().positive(),
    skills: z.array(skillSchema).min(1),
    areas: z.array(areaSchema).min(1),
    objectives: z.array(localized).min(1),
    blocks: z.array(blockSchema).min(1),
  })
  .strict();
export const chapterSchema = z
  .object({
    id,
    slug: id,
    title: text,
    description: localized,
    order: z.number().int().positive(),
    lessons: z.array(lessonSchema).min(1),
  })
  .strict();
export const courseSchema = z
  .object({
    id,
    slug: id,
    level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
    track: z.enum(["general-english", "toeic", "it-business-english"]),
    title: text,
    description: localized,
    status: z.enum(["available", "planned"]),
    outcomes: z.array(text).min(1),
    chapters: z.array(chapterSchema),
  })
  .strict();
export const curriculumSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    publishedAt: z.iso.date(),
    primaryLanguage: z.literal("en"),
    explanationLanguage: z.literal("my"),
    courses: z.array(courseSchema).min(1),
  })
  .strict()
  .superRefine((curriculum, ctx) => {
    const ids = new Set<string>();
    const register = (value: string) => {
      if (ids.has(value))
        ctx.addIssue({ code: "custom", message: `Duplicate content ID: ${value}` });
      ids.add(value);
    };
    const uniqueSlugs = (items: { slug: string }[]) => {
      if (new Set(items.map((item) => item.slug)).size !== items.length)
        ctx.addIssue({ code: "custom", message: "Sibling slugs must be unique" });
    };
    uniqueSlugs(curriculum.courses);
    for (const course of curriculum.courses) {
      register(course.id);
      uniqueSlugs(course.chapters);
      if ((course.status === "available") !== course.chapters.length > 0)
        ctx.addIssue({
          code: "custom",
          message: "Available courses need chapters; planned courses must not expose lessons",
        });
      if (new Set(course.chapters.map((c) => c.order)).size !== course.chapters.length)
        ctx.addIssue({ code: "custom", message: "Chapter orders must be unique" });
      for (const chapter of course.chapters) {
        register(chapter.id);
        uniqueSlugs(chapter.lessons);
        for (const lesson of chapter.lessons) {
          register(lesson.id);
          for (const block of lesson.blocks) {
            register(block.id);
            if (block.type === "writing" && block.maxWords < block.minWords)
              ctx.addIssue({ code: "custom", message: "Writing word range is invalid" });
            if (block.type === "quiz")
              for (const question of block.questions) register(question.id);
          }
        }
      }
    }
  });

// Browser content uses the same structural contract, excluding quiz keys and feedback.
export const publicQuestionSchema = z
  .object({ id, prompt: text, skill: areaSchema, options: z.array(optionSchema).min(2).max(6) })
  .strict();
export const publicBlockSchema = z.discriminatedUnion("type", [
  blockSchema.options[0],
  blockSchema.options[1],
  blockSchema.options[2],
  blockSchema.options[3],
  blockSchema.options[4],
  blockSchema.options[5],
  blockSchema.options[6],
  z
    .object({
      id,
      title: text,
      type: z.literal("quiz"),
      passingPercent: z.number().int().min(1).max(100),
      questions: z.array(publicQuestionSchema).min(1),
    })
    .strict(),
]);
export const publicLessonSchema = lessonSchema.extend({
  blocks: z.array(publicBlockSchema).min(1),
});
export const publicChapterSchema = chapterSchema.extend({
  lessons: z.array(publicLessonSchema).min(1),
});
export const publicCourseSchema = courseSchema.extend({ chapters: z.array(publicChapterSchema) });
export const publicCurriculumSchema = z
  .object({ ...curriculumSchema.shape, courses: z.array(publicCourseSchema).min(1) })
  .strict();
export type Curriculum = z.infer<typeof publicCurriculumSchema>;
export type Course = z.infer<typeof publicCourseSchema>;
export type Chapter = z.infer<typeof publicChapterSchema>;
export type Lesson = z.infer<typeof publicLessonSchema>;
export type LessonBlock = z.infer<typeof publicBlockSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type LearningArea = z.infer<typeof areaSchema>;
export type QuizBlock = Extract<LessonBlock, { type: "quiz" }>;
