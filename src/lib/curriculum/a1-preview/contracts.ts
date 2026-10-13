import { z } from "zod";
import { chapterLessonSchema, chapterAnswerSchema } from "../chapter-preview/contracts";
import { A1_PREVIEW_VERSION } from "./config";
export const a1LessonSchema = chapterLessonSchema.extend({
  contentVersion: z.literal(A1_PREVIEW_VERSION),
});
export const a1AnswerSchema = chapterAnswerSchema.extend({
  contentVersion: z.literal(A1_PREVIEW_VERSION),
});
