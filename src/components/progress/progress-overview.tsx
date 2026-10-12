"use client";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { useSession } from "@/components/progress/session-provider";
import { availableLessons, curriculum } from "@/lib/curriculum";
import { calculateProgress } from "@/lib/learning/progress";
import { SkillBadge } from "@/components/shared/skill-badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ResetProgress } from "./reset-progress";
export function ProgressOverview() {
  const { completed, attempts, mode, loading, studySeconds, studySessionCount, resetSession } =
    useSession();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calculated = calculateProgress(
    availableLessons,
    completed,
    attempts,
    curriculum.contentVersion,
  );
  const finished = attempts.filter(
    (a) => a.status === "completed" && a.contentVersion === curriculum.contentVersion,
  );
  const best = finished.length ? Math.max(...finished.map((a) => a.percentage)) : null;
  if (loading || mode === "loading")
    return (
      <div className="soft-panel mt-7" role="status">
        Loading your progress…
      </div>
    );
  async function download() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/learning/export", { cache: "no-store" });
      if (!response.ok)
        throw new Error("Export failed. Your saved data is unchanged; retry downloading.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "linguatrack-learning-export.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed. Retry.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Sample lessons completed",
            value: `${calculated.completedCount} / ${availableLessons.length}`,
          },
          { label: "Quiz attempts", value: String(attempts.length) },
          {
            label: "Best completed quiz result",
            value: best === null ? "No attempt yet" : `${best}%`,
          },
        ].map(({ label, value }) => (
          <div key={label} className="soft-panel">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-4 text-2xl font-semibold">{value}</p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              {mode === "persistent" ? "Saved to your account" : "Demonstration · resets on reload"}
            </p>
          </div>
        ))}
      </div>
      <section className="soft-panel mt-6">
        <div className="mb-4 flex justify-between">
          <h2 className="section-title">A1 sample chapter</h2>
          <span className="text-sm font-semibold">{calculated.completionPercentage}%</span>
        </div>
        <Progress value={calculated.completionPercentage} aria-label="Completed sample lessons" />
        <p className="mt-4 text-xs text-muted-foreground">
          Completion records lessons you marked complete. A quiz lesson requires a passing attempt.
          Completion is not a CEFR assessment.
        </p>
      </section>
      <section className="mt-7">
        <h2 className="section-title">Your four-skill lesson coverage</h2>
        <p className="mb-4 mt-2 text-xs text-muted-foreground">
          Coverage counts completed lessons that practise a skill; it does not measure proficiency.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(["listening", "speaking", "reading", "writing"] as const).map((skill) => {
            const relevant = availableLessons.filter((l) => l.skills.includes(skill));
            const count = relevant.filter((l) => completed.includes(l.id)).length;
            return (
              <div key={skill} className="soft-panel">
                <div className="mb-4 flex items-center justify-between">
                  <SkillBadge area={skill} />
                  <span className="text-xs text-muted-foreground">
                    {count} / {relevant.length} lessons
                  </span>
                </div>
                <Progress
                  value={relevant.length ? (count / relevant.length) * 100 : 0}
                  aria-label={`${skill} lesson coverage`}
                  className="h-1.5"
                />
              </div>
            );
          })}
        </div>
      </section>
      <section className="mt-7">
        <h2 className="section-title">Demonstrated quiz evidence</h2>
        <p className="mb-4 mt-2 text-xs leading-6 text-muted-foreground">
          Latest answer per unique question in content v{curriculum.contentVersion}; repeated
          attempts do not add extra evidence. These multiple-choice checks assess recognition,
          including the writing question. They do not establish speaking, listening, reading or
          free-writing proficiency, or a CEFR level.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(["listening", "speaking", "reading", "writing", "grammar", "vocabulary"] as const).map(
            (area) => {
              const evidence = calculated.evidence[area];
              return (
                <div key={area} className="soft-panel">
                  <SkillBadge area={area} />
                  <p className="mt-4 text-xl font-semibold">
                    {evidence.percentage === null
                      ? "Not assessed"
                      : `${evidence.percentage}% recognition accuracy`}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {evidence.total
                      ? `${evidence.correct} / ${evidence.total} unique questions correct`
                      : "No scored questions in this area yet."}
                  </p>
                </div>
              );
            },
          )}
        </div>
      </section>
      {mode === "persistent" && (
        <section className="soft-panel mt-6">
          <h2 className="section-title">Study activity</h2>
          <p className="mt-3 text-sm">
            {Math.floor(studySeconds / 60)} min {studySeconds % 60} sec · {studySessionCount}{" "}
            browser study session(s)
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Estimated from visible lesson heartbeats. Long gaps and hidden tabs do not add study
            time. This is activity, not proficiency.
          </p>
        </section>
      )}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-5">
        <p className="text-xs text-muted-foreground" role="status">
          {mode === "persistent"
            ? "Download your complete learning history, including earlier curriculum versions."
            : "Preview progress is held in memory for this session."}
        </p>
        {mode === "persistent" ? (
          <Button
            onClick={download}
            disabled={exporting}
            variant="outline"
            className="rounded-lg text-xs"
          >
            <Download aria-hidden="true" />
            {exporting ? "Preparing export…" : "Export learning data"}
          </Button>
        ) : (
          <Button
            onClick={resetSession}
            disabled={!completed.length && !attempts.length}
            variant="outline"
            className="rounded-lg text-xs"
          >
            <RotateCcw aria-hidden="true" />
            Reset demo session
          </Button>
        )}
        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="mt-4">
        <ResetProgress />
      </div>
    </>
  );
}
