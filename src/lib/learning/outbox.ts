import { answerSubmissionSchema, type AnswerSubmission } from "./contracts";
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const key = (owner: string) => `linguatrack:pending:v1:${owner}`;
export function readOutbox(storage: DraftStorage, owner: string): AnswerSubmission[] {
  const raw = storage.getItem(key(owner));
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "Pending answers could not be read. Export browser storage before clearing it.",
    );
  }
  const parsed = answerSubmissionSchema.array().safeParse(value);
  if (!parsed.success)
    throw new Error(
      "Pending answers could not be read. Export browser storage before clearing it.",
    );
  return parsed.data;
}
export function queueAnswer(storage: DraftStorage, owner: string, answer: AnswerSubmission) {
  const pending = readOutbox(storage, owner);
  const previous = pending.find(
    (item) => item.attemptId === answer.attemptId && item.questionId === answer.questionId,
  );
  if (previous && previous.optionId !== answer.optionId)
    throw new Error("This answer is already queued. Retry saving it before changing it.");
  if (!previous) storage.setItem(key(owner), JSON.stringify([...pending, answer]));
}
export function acknowledgeAnswer(storage: DraftStorage, owner: string, answer: AnswerSubmission) {
  const remaining = readOutbox(storage, owner).filter(
    (item) => item.attemptId !== answer.attemptId || item.questionId !== answer.questionId,
  );
  if (remaining.length) storage.setItem(key(owner), JSON.stringify(remaining));
  else storage.removeItem(key(owner));
}

// Discard only generations explicitly invalidated by an acknowledged account reset.
export function discardResetAnswers(storage: DraftStorage, owner: string, generation: number) {
  const pending = readOutbox(storage, owner);
  const remaining = pending.filter((answer) => answer.generation >= generation);
  if (remaining.length !== pending.length) {
    if (remaining.length) storage.setItem(key(owner), JSON.stringify(remaining));
    else storage.removeItem(key(owner));
  }
  return { pending: remaining, discarded: pending.length - remaining.length };
}
