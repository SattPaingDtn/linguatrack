import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import raw from "../../src/content/v1/curriculum.json";
import { convertV1 } from "../../src/lib/curriculum/v2/bridge";
import { inspectWav } from "../../src/lib/curriculum/v2/files";
import { fingerprint, sha256 } from "../../src/lib/curriculum/v2/json";
import type { CurriculumPackage } from "../../src/lib/curriculum/v2/package";
export const bytes = readFileSync(resolve("src/content/v1/curriculum.json"));
export const audio = readFileSync(resolve("public/audio/a1-introductions.wav"));
export const legacy = raw;
export const options = { legacy, legacyHash: sha256(bytes) };
export const media = new Map([
  [
    "/audio/a1-introductions.wav",
    { bytes: audio, durationMs: inspectWav(audio).durationMs!, contentType: "audio/wav" as const },
  ],
]);
export const bridge = () => convertV1(legacy, { sourceHash: options.legacyHash, media });
export const translated = { en: "Practice English.", my: "အင်္ဂလိပ်စာ လေ့ကျင့်ပါ။" };
export function refreshMappings(pkg: CurriculumPackage) {
  for (const m of pkg.compatibility) {
    const e = Object.values(pkg.public)
      .flat()
      .find(
        (e) => e.kind === m.to.ref.kind && e.id === m.to.ref.id && e.revision === m.to.ref.revision,
      );
    if (e) m.fingerprints.target = fingerprint(e);
  }
}
