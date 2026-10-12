"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { availableLessons, curriculum } from "@/lib/curriculum";
import {
  emptySnapshot,
  learningSnapshotSchema,
  type AnswerSubmission,
  type ExerciseResponse,
  type LearningSnapshot,
  type QuizAttempt,
} from "@/lib/learning/contracts";
import {
  answerResultSchema,
  learningStateSchema,
  requestJson,
  type LearningState,
} from "@/lib/learning/client";
import {
  acknowledgeAnswer,
  discardResetAnswers,
  queueAnswer,
  readOutbox,
} from "@/lib/learning/outbox";
export type { QuizAttempt } from "@/lib/learning/contracts";
type Session = LearningSnapshot & {
  mode: "loading" | "preview" | "persistent";
  configured: boolean;
  user: LearningState["user"];
  loading: boolean;
  error: string | null;
  pendingAnswers: AnswerSubmission[];
  completeLesson: (id: string) => Promise<void>;
  submitAnswer: (answer: AnswerSubmission) => Promise<ExerciseResponse>;
  visitLesson: (id: string, block: string | null) => Promise<void>;
  reviewMistake: (id: string) => Promise<void>;
  refresh: (clearIdentity?: boolean) => Promise<void>;
  retrySync: () => Promise<void>;
  resetSession: () => void;
  resetProgress: () => Promise<void>;
  resetting: boolean;
};
const SessionContext = createContext<Session | null>(null);
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Learning data could not be saved. Keep this page open and retry.";
}
export function SessionProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: LearningState;
}) {
  const [snapshot, setSnapshot] = useState<LearningSnapshot>(initial?.snapshot ?? emptySnapshot);
  const [mode, setMode] = useState<Session["mode"]>(initial?.mode ?? "loading");
  const [configured, setConfigured] = useState(initial?.configured ?? false);
  const [user, setUser] = useState<LearningState["user"]>(initial?.user ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingAnswers, setPendingAnswers] = useState<AnswerSubmission[]>([]);
  const [resetting, setResetting] = useState(false);
  const owner = useRef(initial?.user?.id ?? null);
  const learningGeneration = useRef(initial?.snapshot.generation ?? 0);
  const mutationEpoch = useRef(0);
  const resetInFlight = useRef(false);
  const resetRequest = useRef<{ owner: string; requestId: string; generation: number } | null>(
    null,
  );
  const revision = useRef(0);
  const refreshGeneration = useRef(0);
  const sequence = useRef(0);
  const pendingPosition = useRef<{
    owner: string;
    lessonId: string;
    blockId: string | null;
  } | null>(null);
  const refresh = useCallback(async (clearIdentity = false) => {
    if (resetInFlight.current) return;
    const generation = ++refreshGeneration.current;
    if (clearIdentity) {
      owner.current = null;
      revision.current++;
      setUser(null);
      setSnapshot(emptySnapshot);
      setPendingAnswers([]);
      setMode("loading");
      setLoading(true);
    }
    const startingRevision = revision.current;
    try {
      const state = await requestJson("/api/learning", learningStateSchema);
      if (generation !== refreshGeneration.current) return;
      const changedOwner = owner.current !== (state.user?.id ?? null);
      const changedGeneration = learningGeneration.current !== state.snapshot.generation;
      if (changedOwner || changedGeneration) {
        mutationEpoch.current++;
        pendingPosition.current = null;
        learningGeneration.current = state.snapshot.generation;
      }
      if (changedOwner || changedGeneration || startingRevision === revision.current)
        setSnapshot((previous) =>
          state.mode === "preview" && !changedOwner && !clearIdentity ? previous : state.snapshot,
        );
      owner.current = state.user?.id ?? null;
      setMode(state.mode);
      setConfigured(state.configured);
      setUser(state.user);
      if (!pendingPosition.current) setError(null);
      if (state.user) {
        const result = discardResetAnswers(localStorage, state.user.id, state.snapshot.generation);
        setPendingAnswers(result.pending);
        if (result.discarded)
          setError(
            "Learning history was reset. Pending answers from before that reset were cleared.",
          );
      } else setPendingAnswers([]);
    } catch (error) {
      setError(message(error));
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (initial) return;
    queueMicrotask(() => {
      void refresh();
    });
    const reload = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refresh, initial]);
  useEffect(() => {
    if (!pendingAnswers.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingAnswers.length]);

  async function submitAnswer(input: AnswerSubmission) {
    const submittingOwner = owner.current;
    const startingEpoch = mutationEpoch.current;
    if (resetInFlight.current || input.generation !== learningGeneration.current)
      throw new Error("Learning history was reset or is resetting. Reload before answering again.");
    if (mode === "loading" || loading)
      throw new Error("Wait for your learning data to load before submitting.");
    if (submittingOwner) {
      try {
        queueAnswer(localStorage, submittingOwner, input);
        setPendingAnswers(readOutbox(localStorage, submittingOwner));
      } catch (error) {
        throw new Error(
          `Unable to protect this answer before saving. ${message(error)} Keep this page open.`,
        );
      }
    }
    const result = await requestJson("/api/learning/answer", answerResultSchema, input);
    if (owner.current !== submittingOwner || startingEpoch !== mutationEpoch.current)
      throw new Error(
        "Your account or learning history changed while saving. Reload to check the current saved data.",
      );
    if (submittingOwner && result.mode !== "persistent")
      throw new Error(
        "Your sign-in expired. Sign in again; your queued answer is retained for this account.",
      );
    revision.current++;
    let response: ExerciseResponse;
    if (result.mode === "persistent") {
      const found = result.attempt.responses.find((r) => r.questionId === input.questionId);
      if (
        !found ||
        result.attempt.id !== input.attemptId ||
        result.attempt.lessonId !== input.lessonId ||
        result.attempt.quizId !== input.quizId ||
        result.attempt.contentVersion !== input.contentVersion ||
        found.selectedOptionId !== input.optionId
      )
        throw new Error("The server did not acknowledge this answer. Retry saving it.");
      response = found;
      setSnapshot((previous) => ({
        ...previous,
        attempts: [result.attempt, ...previous.attempts.filter((a) => a.id !== result.attempt.id)],
        mistakes:
          response.isCorrect || previous.mistakes.some((m) => m.responseId === response.id)
            ? previous.mistakes
            : [...previous.mistakes, { responseId: response.id, reviewedAt: null }],
      }));
      // Acknowledge after applying the confirmed result, never before the network reply.
      if (submittingOwner) {
        acknowledgeAnswer(localStorage, submittingOwner, input);
        setPendingAnswers(readOutbox(localStorage, submittingOwner));
      }
    } else {
      response = result.response;
      setSnapshot((previous) => {
        const old = previous.attempts.find((a) => a.id === input.attemptId);
        const responses = [
          ...(old?.responses ?? []).filter((r) => r.questionId !== input.questionId),
          response,
        ];
        const correct = responses.filter((r) => r.isCorrect).length;
        const percentage = Math.round((correct / result.total) * 100);
        const finished = responses.length === result.total;
        const attempt: QuizAttempt = {
          id: input.attemptId,
          quizId: input.quizId,
          lessonId: input.lessonId,
          contentVersion: input.contentVersion,
          title: result.title,
          correct,
          total: result.total,
          answered: responses.length,
          percentage,
          passed: finished && percentage >= result.passingPercent,
          timestamp: old?.timestamp ?? response.timestamp,
          completedAt: finished ? response.timestamp : null,
          status: finished ? "completed" : "in_progress",
          answers: Object.fromEntries(responses.map((r) => [r.questionId, r.selectedOptionId])),
          responses,
        };
        return {
          ...previous,
          attempts: [attempt, ...previous.attempts.filter((a) => a.id !== attempt.id)],
          mistakes: response.isCorrect
            ? previous.mistakes
            : [...previous.mistakes, { responseId: response.id, reviewedAt: null }],
        };
      });
    }
    if (!pendingPosition.current) setError(null);
    return response;
  }
  async function completeLesson(id: string) {
    if (resetInFlight.current) throw new Error("Wait for the progress reset to finish.");
    const startingEpoch = mutationEpoch.current;
    if (mode === "loading" || loading) throw new Error("Wait for learning data to finish loading.");
    const lesson = availableLessons.find((l) => l.id === id);
    if (!lesson) throw new Error("Unknown lesson.");
    if (mode === "preview") {
      if (
        !lesson.blocks
          .filter((b) => b.type === "quiz")
          .every((q) => snapshot.attempts.some((a) => a.quizId === q.id && a.passed))
      )
        throw new Error("Pass the quiz before completing this lesson.");
      setSnapshot((previous) => ({
        ...previous,
        completed: previous.completed.includes(id)
          ? previous.completed
          : [...previous.completed, id],
      }));
      return;
    }
    const savingOwner = owner.current;
    const saved = await requestJson("/api/learning/complete", learningSnapshotSchema, {
      contentVersion: curriculum.contentVersion,
      lessonId: id,
      generation: learningGeneration.current,
    });
    if (owner.current !== savingOwner || startingEpoch !== mutationEpoch.current)
      throw new Error("Account or learning history changed while saving completion. Reload.");
    revision.current++;
    setSnapshot(saved);
    if (!pendingPosition.current) setError(null);
  }
  const userId = user?.id;
  const visitLesson = useCallback(
    async (lessonId: string, blockId: string | null) => {
      if (mode !== "persistent" || !userId || resetInFlight.current) return;
      const startingEpoch = mutationEpoch.current;
      const savingOwner = userId;
      pendingPosition.current = { owner: savingOwner, lessonId, blockId };
      try {
        const key = `linguatrack:study:${savingOwner}`;
        let sessionId = sessionStorage.getItem(key);
        if (!sessionId || !z.uuid().safeParse(sessionId).success) {
          sessionId = crypto.randomUUID();
          sessionStorage.setItem(key, sessionId);
        }
        sequence.current = Math.max(Date.now(), sequence.current + 1);
        const submittedSequence = sequence.current;
        await requestJson("/api/learning/position", z.object({ saved: z.literal(true) }), {
          contentVersion: curriculum.contentVersion,
          lessonId,
          blockId,
          sessionId,
          sequence: sequence.current,
          generation: learningGeneration.current,
        });
        if (
          owner.current !== savingOwner ||
          sequence.current !== submittedSequence ||
          startingEpoch !== mutationEpoch.current
        )
          return;
        revision.current++;
        setSnapshot((previous) => ({
          ...previous,
          profile: {
            lastLessonId: lessonId,
            lastBlockId: blockId,
            contentVersion: curriculum.contentVersion,
            updatedAt: new Date().toISOString(),
          },
        }));
        pendingPosition.current = null;
        setError(null);
      } catch (error) {
        if (owner.current === savingOwner && startingEpoch === mutationEpoch.current)
          setError(`Resume position was not saved. ${message(error)}`);
        throw error;
      }
    },
    [mode, userId],
  );
  async function reviewMistake(id: string) {
    if (resetInFlight.current) throw new Error("Wait for the progress reset to finish.");
    const startingEpoch = mutationEpoch.current;
    const savingOwner = owner.current;
    const reviewedAt = new Date().toISOString();
    if (mode === "persistent")
      await requestJson("/api/learning/mistake", z.object({ reviewedAt: z.string() }), {
        responseId: id,
        generation: learningGeneration.current,
      });
    if (owner.current !== savingOwner || startingEpoch !== mutationEpoch.current)
      throw new Error("Account or learning history changed while saving review. Reload.");
    revision.current++;
    setSnapshot((previous) => ({
      ...previous,
      mistakes: previous.mistakes.map((m) => (m.responseId === id ? { ...m, reviewedAt } : m)),
    }));
  }
  async function retrySync() {
    try {
      if (user) for (const input of readOutbox(localStorage, user.id)) await submitAnswer(input);
      if (pendingPosition.current && pendingPosition.current.owner === user?.id)
        await visitLesson(pendingPosition.current.lessonId, pendingPosition.current.blockId);
      await refresh();
    } catch (error) {
      setError(message(error));
    }
  }
  function resetSession() {
    if (mode !== "preview") return;
    revision.current++;
    setSnapshot(emptySnapshot);
    if (!pendingPosition.current) setError(null);
  }
  async function resetProgress() {
    const resettingOwner = owner.current;
    if (mode !== "persistent" || !resettingOwner || loading)
      throw new Error("Sign in and wait for your learning data to load before resetting.");
    if (resetInFlight.current) throw new Error("A progress reset is already running.");
    if (!resetRequest.current || resetRequest.current.owner !== resettingOwner)
      resetRequest.current = {
        owner: resettingOwner,
        requestId: crypto.randomUUID(),
        generation: learningGeneration.current,
      };
    resetInFlight.current = true;
    setResetting(true);
    mutationEpoch.current++;
    revision.current++;
    refreshGeneration.current++;
    try {
      const saved = await requestJson("/api/learning/reset", learningSnapshotSchema, {
        requestId: resetRequest.current.requestId,
        generation: resetRequest.current.generation,
        contentVersion: curriculum.contentVersion,
        confirmation: "RESET",
      });
      if (owner.current !== resettingOwner)
        throw new Error("Account changed during reset. Sign back in to check its learning data.");
      learningGeneration.current = saved.generation;
      pendingPosition.current = null;
      setSnapshot(saved);
      const result = discardResetAnswers(localStorage, resettingOwner, saved.generation);
      setPendingAnswers(result.pending);
      resetRequest.current = null;
      setError(null);
    } catch (error) {
      // Keep the same request ID for a safe retry if the database committed but the reply was lost.
      throw new Error(
        `${message(error)} Retry reset to confirm its outcome, or reload to check your saved data.`,
      );
    } finally {
      resetInFlight.current = false;
      setResetting(false);
    }
  }
  return (
    <SessionContext.Provider
      value={{
        ...snapshot,
        mode,
        configured,
        user,
        loading,
        error,
        pendingAnswers,
        completeLesson,
        submitAnswer,
        visitLesson,
        reviewMistake,
        refresh,
        retrySync,
        resetSession,
        resetProgress,
        resetting,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const state = useContext(SessionContext);
  if (!state) throw new Error("useSession must be used inside SessionProvider");
  return state;
}
