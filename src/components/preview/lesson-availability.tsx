// Labels describe available preview activities, never learner completion or proficiency.
export function LessonAvailability({ id, areas }: { id: string; areas: readonly string[] }) {
  const audioPending =
    id === "a1-c1-meet-colleagues" ||
    id === "a1-c2-family-scripts" ||
    id === "a1-c3-routine-scripts" ||
    /^a1-c[456]-(home|shopping|work)-scripts$/.test(id);
  return (
    <div className="mt-4 space-y-2 text-sm leading-7">
      <p className="font-semibold text-primary">Available to study · unsaved preview</p>
      {audioPending && <p>Audio pending · read the scripts; listening checks unavailable.</p>}
      {(areas.includes("speaking") || areas.includes("writing")) && (
        <p>Speaking / writing activities are ungraded self-practice.</p>
      )}
    </div>
  );
}
