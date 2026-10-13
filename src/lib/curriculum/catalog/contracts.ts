import { z } from "zod";
import { idSchema, refSchema } from "../v2/common";

export const catalogReleaseSchema = z.discriminatedUnion("schemaVersion", [
  z.object({ schemaVersion: z.literal(1), contentVersion: z.literal("1.0.0") }).strict(),
  z.object({ schemaVersion: z.literal(2), contentVersion: z.literal("1.3.0") }).strict(),
]);
export type CatalogRelease = z.infer<typeof catalogReleaseSchema>;
export const catalogReferenceSchema = z.discriminatedUnion("schemaVersion", [
  catalogReleaseSchema.options[0]
    .extend({ kind: z.enum(["course", "chapter", "lesson", "block", "question"]), id: idSchema })
    .strict(),
  catalogReleaseSchema.options[1].extend({ ref: refSchema }).strict(),
]);
export type CatalogReference = z.infer<typeof catalogReferenceSchema>;

// Pins only: no active/latest alias, filesystem path, or activation setting.
export const DRAFT_CHAIN_PINS = [
  { version: "1.1.0", hash: "d3bc6e336d3cf25ee74eb8cf7c1ce69e6a4cff9aefea9a2d99ed833d7648a668" },
  { version: "1.2.0", hash: "c37cbacb93e1591f1b95d0473ac30f59895d3b9e05e50561330d58ee3297a755" },
  { version: "1.3.0", hash: "0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029" },
] as const;
