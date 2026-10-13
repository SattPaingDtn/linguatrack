// Strict, browser-safe DTO contracts. Grading and registry modules are excluded.
import { z } from "zod";
import { hashSchema, idSchema, reference } from "../v2/common";
import {
  blockSchema,
  exerciseSchema,
  lessonSchema,
  objectiveSchema,
  stimulusSchema,
} from "../v2/public";
import { CHAPTER_PREVIEW_VERSION } from "./config";
export const chapterLessonSchema = z
  .object({
    contentVersion: z.literal(CHAPTER_PREVIEW_VERSION),
    publicDigest: hashSchema,
    lesson: lessonSchema,
    objectives: z.array(objectiveSchema),
    blocks: z.array(blockSchema),
    questions: z.array(exerciseSchema.options[0].refine((e) => e.selection === "single")),
    // Only reading stimuli and actually available audio URLs. No hidden transcripts/rules.
    passages: z.array(stimulusSchema.options[0]),
    audio: z.array(
      z
        .object({
          blockId: idSchema,
          src: z.literal("/audio/a1-introductions.wav"),
          transcript: z.string().min(1),
        })
        .strict(),
    ),
    awaitingAudioIds: z.array(idSchema),
  })
  .strict();
export type ChapterPreviewLesson = z.infer<typeof chapterLessonSchema>;
export const chapterAnswerSchema = z
  .object({
    contentVersion: z.literal(CHAPTER_PREVIEW_VERSION),
    lessonId: idSchema,
    publicDigest: hashSchema,
    exercise: reference("exercise"),
    optionId: idSchema,
  })
  .strict();
