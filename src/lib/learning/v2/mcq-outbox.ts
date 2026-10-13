import { z } from "zod";
import type { DraftStorage } from "../outbox";
import {
  mcqSubmissionSchema,
  mcqReceiptSchema,
  submissionIdentity,
  type McqSubmission,
  type McqReceipt,
} from "./mcq-contracts";
export type OutboxScope = { ownerId: string; projectRef: string };
const scopeSchema = z
  .object({ ownerId: z.uuid(), projectRef: z.string().regex(/^[a-z0-9]{20}$/) })
  .strict();
const key = (scope: OutboxScope) => {
  const s = scopeSchema.parse(scope);
  return `linguatrack:pending:v2:${s.projectRef}:${s.ownerId}`;
};
export function readMcqOutbox(storage: DraftStorage, scope: OutboxScope) {
  const value = storage.getItem(key(scope));
  if (!value) return [];
  try {
    return mcqSubmissionSchema.array().parse(JSON.parse(value));
  } catch {
    throw new Error(
      "Pending v2 answers could not be read. Preserve browser storage before clearing it.",
    );
  }
}
function store(storage: DraftStorage, scope: OutboxScope, items: McqSubmission[]) {
  try {
    if (items.length) storage.setItem(key(scope), JSON.stringify(items));
    else storage.removeItem(key(scope));
  } catch {
    throw new Error(
      "Browser storage failed. Keep the answer and any returned feedback on screen and retry. Local queue changes could not be confirmed.",
    );
  }
}
export function queueMcq(storage: DraftStorage, scope: OutboxScope, raw: unknown) {
  const input = mcqSubmissionSchema.parse(raw),
    pending = readMcqOutbox(storage, scope);
  const existing = pending.find(
    (p) =>
      p.responseId === input.responseId ||
      (p.attemptId === input.attemptId &&
        p.exercise.id === input.exercise.id &&
        p.exercise.revision === input.exercise.revision),
  );
  if (existing && submissionIdentity(existing) !== submissionIdentity(input))
    throw new Error(
      "This exercise already has a queued answer. Retry it or start a separate attempt.",
    );
  if (!existing) store(storage, scope, [...pending, input]);
  return input;
}
export function acknowledgeMcq(
  storage: DraftStorage,
  scope: OutboxScope,
  raw: unknown,
): McqReceipt {
  const receipt = mcqReceiptSchema.parse(raw),
    pending = readMcqOutbox(storage, scope);
  const original = pending.find((p) => p.responseId === receipt.responseId);
  if (
    receipt.ownerId !== scope.ownerId ||
    receipt.projectRef !== scope.projectRef ||
    !original ||
    submissionIdentity(original) !== submissionIdentity(receipt.submission)
  )
    throw new Error(
      "Save acknowledgement did not match this account and queued answer. Keep it pending and retry.",
    );
  store(
    storage,
    scope,
    pending.filter((p) => p.responseId !== receipt.responseId),
  );
  return receipt;
}
export function discardResetMcq(storage: DraftStorage, scope: OutboxScope, raw: unknown) {
  const snapshot = z
    .object({ userId: z.uuid(), generation: z.number().int().nonnegative().max(2147483647) })
    .parse(raw);
  if (snapshot.userId !== scope.ownerId)
    throw new Error("Reset owner mismatch; pending answers retained.");
  const pending = readMcqOutbox(storage, scope),
    remaining = pending.filter((p) => p.generation >= snapshot.generation);
  if (remaining.length !== pending.length) store(storage, scope, remaining);
  return { pending: remaining, discarded: pending.length - remaining.length };
}
export async function syncMcqOutbox(
  storage: DraftStorage,
  scope: OutboxScope,
  activeIdentity: () => Promise<OutboxScope | null>,
  send: typeof fetch = fetch,
  onCommitted: (receipt: McqReceipt) => void = () => {},
) {
  const saved: McqReceipt[] = [];
  for (const input of readMcqOutbox(storage, scope)) {
    const current = await activeIdentity();
    if (!current || current.ownerId !== scope.ownerId || current.projectRef !== scope.projectRef)
      throw new Error(
        "Account changed. Pending answers belong to the original account and were not sent.",
      );
    const response = await send("/api/learning/v2/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Learner-ID": scope.ownerId },
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(input),
    });
    const data: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        "V2 answer is still pending. Sign in to its original account and retry; it has not been discarded.",
      );
    const receipt = acknowledgeMcq(storage, scope, data);
    saved.push(receipt);
    // Deliver each confirmed result even when a later answer in this batch fails.
    onCommitted(receipt);
  }
  return saved;
}
