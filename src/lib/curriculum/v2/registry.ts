// Read-only local registry composition for validating a chain of immutable packages.
import { fail, fingerprint } from "./json";
import { refKey, type RegistrySnapshot } from "./validate";
export function mergeRegistrySnapshots(
  ...snapshots: (RegistrySnapshot | undefined)[]
): RegistrySnapshot {
  const merge = <T>(rows: T[], key: (value: T) => string): T[] => {
    const result = new Map<string, T>();
    for (const row of rows) {
      const previous = result.get(key(row));
      if (previous && fingerprint(previous) !== fingerprint(row))
        fail(
          "registry-conflict",
          key(row),
          "Ancestor snapshots disagree about an immutable record",
        );
      result.set(key(row), row);
    }
    return [...result.values()];
  };
  const all = snapshots.filter((s): s is RegistrySnapshot => s !== undefined);
  return {
    releases: merge(
      all.flatMap((s) => s.releases),
      (r) => `${r.curriculumId}:${r.contentVersion}`,
    ),
    entities: merge(
      all.flatMap((s) => s.entities),
      (e) => refKey(e.ref),
    ),
    grading: merge(
      all.flatMap((s) => s.grading),
      (r) => refKey(r.exerciseRef),
    ),
    policies: merge(
      all.flatMap((s) => s.policies),
      (p) => refKey(p.assessmentRef),
    ),
  };
}
