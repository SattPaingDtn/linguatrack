import { z } from "zod";
import { curriculumSchema } from "../schema";
import { type LegacyOrigin, type Ref, ref } from "./common";
import { canonicalJson, fingerprint, sha256 } from "./json";
import { type CurriculumPackage } from "./package";
import type { PublicCollections, PublicEntity } from "./public";
import { legacyEntities, legacyValue } from "./validate";
export type LegacyCurriculum = z.infer<typeof curriculumSchema>;
export type BridgeMedia = {
  bytes: Uint8Array;
  durationMs: number;
  contentType: "audio/wav" | "audio/mpeg" | "audio/ogg";
};
export type BridgeOptions = {
  sourceHash: string;
  contentVersion?: string;
  createdAt?: string;
  media: ReadonlyMap<string, BridgeMedia>;
};
const english = (text: string) => ({ language: "en" as const, text });
const bilingual = (en: string, my: string) => ({ en, my });
const choose = bilingual("Choose one answer.", "အဖြေတစ်ခုကို ရွေးပါ။");
export function convertV1(input: unknown, options: BridgeOptions): CurriculumPackage {
  const { legacy, index } = legacyEntities(input);
  const pub: PublicCollections = {
    courses: [],
    chapters: [],
    lessons: [],
    blocks: [],
    objectives: [],
    exercises: [],
    assessments: [],
    stimuli: [],
    transcripts: [],
    assets: [],
  };
  const pkg: CurriculumPackage = {
    manifest: {
      schemaVersion: 2,
      contractVersion: "2.0.0",
      curriculumId: "linguatrack-academy",
      contentVersion: options.contentVersion ?? "1.1.0",
      state: "draft",
      createdAt: options.createdAt ?? `${legacy.publishedAt}T00:00:00.000Z`,
      basedOn: {
        schemaVersion: 1,
        contentVersion: legacy.contentVersion,
        sha256: options.sourceHash,
      },
      locales: ["en", "my"],
      teachingLanguage: "en",
      explanationLanguage: "my",
      courseRefs: [],
      requiredCapabilities: ["legacy-v1-bridge", "multiple_choice", "package-media"],
      cefrAwarding: "disabled",
      files: [],
      legacyLocaleExceptions: [],
      editorialApprovals: [],
    },
    public: pub,
    private: {
      grading: { exerciseRules: [], assessmentPolicies: [] },
      rubrics: [],
      transcripts: [],
    },
    compatibility: [],
  };
  const source = (kind: LegacyOrigin["kind"], id: string, pointer?: string): LegacyOrigin => ({
    schemaVersion: 1,
    contentVersion: legacy.contentVersion,
    kind,
    id,
    ...(pointer ? { pointer } : {}),
  });
  const meta = <K extends Ref["kind"]>(kind: K, id: string, origin?: LegacyOrigin) => ({
    kind,
    id,
    revision: 1,
    ...(origin ? { source: origin } : {}),
  });
  const legacyText = (
    target: Ref,
    pointer: string,
    origin: LegacyOrigin,
    text: string,
    language: "en" | "my" = "en",
  ) => {
    pkg.manifest.legacyLocaleExceptions.push({
      target: { ref: ref(target.kind, target.id, target.revision), pointer },
      source: origin,
      reason: "untranslated-v1-field",
      reviewStatus: "pending",
    });
    return { legacy: true as const, language, text, source: origin };
  };
  const assetByUrl = new Map<string, Ref<"asset">>();
  for (const course of legacy.courses) {
    const difficulty = (minutes = 1) => ({
      targetCefr: course.level,
      band: "introductory" as const,
      estimateSource: "author" as const,
      estimatedMinutes: minutes,
    });
    const courseRef = ref("course", course.id);
    pkg.manifest.courseRefs.push(courseRef);
    const outcomeRefs = course.outcomes.map((text, i) => {
      const id = `${course.id}-outcome-${i + 1}`;
      const target = ref("objective", id);
      const origin = source("course", course.id, `/outcomes/${i}`);
      pub.objectives.push({
        ...meta("objective", id, origin),
        statement: legacyText(target, "/statement", origin, text),
        action: "recognize",
        tags: {
          areas: ["grammar", "vocabulary", "listening", "speaking", "reading", "writing"],
          coreSkills: [],
        },
        successCriterion: legacyText(target, "/successCriterion", origin, text),
        expectedEvidence: ["self_practice"],
        difficulty: difficulty(),
        descriptorRefs: [],
      });
      return target;
    });
    pub.courses.push({
      ...meta("course", course.id, source("course", course.id)),
      slug: course.slug,
      title: legacyText(courseRef, "/title", source("course", course.id, "/title"), course.title),
      description: course.description,
      level: course.level,
      track: course.track,
      status: course.status,
      coverageState: "partial",
      outcomeRefs,
      chapterRefs: course.chapters.map((c) => ref("chapter", c.id)),
      coverageTargets: [],
    });
    for (const chapter of course.chapters) {
      const chapterRef = ref("chapter", chapter.id);
      const assessmentRefs: Ref<"assessment">[] = [];
      const chapterObjectiveRefs: Ref<"objective">[] = [];
      for (const lesson of chapter.lessons) {
        const lessonRef = ref("lesson", lesson.id);
        const objectiveRefs = lesson.objectives.map((statement, i) => {
          const id = `${lesson.id}-objective-${i + 1}`;
          const target = ref("objective", id);
          pub.objectives.push({
            ...meta("objective", id, source("lesson", lesson.id, `/objectives/${i}`)),
            statement,
            action: "recognize",
            tags: { areas: lesson.areas, coreSkills: lesson.skills },
            successCriterion: statement,
            expectedEvidence: ["self_practice"],
            difficulty: difficulty(),
            descriptorRefs: [],
          });
          return target;
        });
        chapterObjectiveRefs.push(...objectiveRefs);
        const quizBlocks = lesson.blocks.filter((b) => b.type === "quiz");
        // The legacy completion server requires every quiz in a lesson. Contract 2.0.0 has one gate.
        // Refuse an ambiguous bridge rather than silently weakening a multi-quiz completion rule.
        if (quizBlocks.length > 1)
          throw new Error(
            `Lesson ${lesson.id} has multiple quiz gates; an explicit aggregate assessment mapping is required`,
          );
        const assessmentId = (quizId: string) =>
          quizId === "a1-c1-quiz" ? "a1-c1-assessment" : `${quizId}-assessment`;
        pub.lessons.push({
          ...meta("lesson", lesson.id, source("lesson", lesson.id)),
          chapterRef,
          slug: lesson.slug,
          title: legacyText(
            lessonRef,
            "/title",
            source("lesson", lesson.id, "/title"),
            lesson.title,
          ),
          description: lesson.description,
          tags: { areas: lesson.areas, coreSkills: lesson.skills },
          difficulty: difficulty(lesson.durationMinutes),
          objectiveRefs,
          prerequisites: [],
          blockRefs: lesson.blocks.map((b) => ref("block", b.id)),
          completionPolicy: quizBlocks.length
            ? {
                type: "assessment_pass",
                assessmentRef: ref("assessment", assessmentId(quizBlocks[0]!.id)),
              }
            : { type: "self_reported" },
        });
        for (const block of lesson.blocks) {
          const blockRef = ref("block", block.id);
          const base = {
            ...meta("block", block.id, source("block", block.id)),
            lessonRef,
            title: legacyText(blockRef, "/title", source("block", block.id, "/title"), block.title),
          };
          switch (block.type) {
            case "explanation":
              pub.blocks.push({
                ...base,
                type: block.type,
                body: block.body,
                examples: block.examples.map(english),
              });
              break;
            case "grammar":
              pub.blocks.push({
                ...base,
                type: block.type,
                rule: block.rule,
                examples: block.examples.map((e) => ({
                  pattern: e.pattern,
                  example: english(e.example),
                  translation: e.translation,
                })),
              });
              break;
            case "vocabulary":
              pub.blocks.push({
                ...base,
                type: block.type,
                words: block.words.map((w, i) => ({
                  word: w.word,
                  pronunciation: w.pronunciation,
                  meaning: legacyText(
                    blockRef,
                    `/words/${i}/meaning`,
                    source("block", block.id, `/words/${i}/meaning`),
                    w.meaning,
                    "my",
                  ),
                  example: english(w.example),
                })),
              });
              break;
            case "reading": {
              const stimulusRef = ref("stimulus", `${block.id}-stimulus`);
              pub.stimuli.push({
                ...meta("stimulus", stimulusRef.id),
                type: "reading",
                passage: english(block.passage),
                sourceAttribution: "LinguaTrack Academy v1 teaching content",
              });
              pub.blocks.push({
                ...base,
                type: block.type,
                stimulusRef,
                explanation: block.explanation,
              });
              break;
            }
            case "listening": {
              const media = options.media.get(block.audio);
              if (!media) throw new Error(`Missing legacy audio ${block.audio} for ${block.id}`);
              let audioRef = assetByUrl.get(block.audio);
              if (!audioRef) {
                audioRef = ref("asset", `${block.id}-audio`);
                assetByUrl.set(block.audio, audioRef);
                pub.assets.push({
                  ...meta("asset", audioRef.id),
                  language: "en",
                  contentType: media.contentType,
                  storage: { type: "package", path: `media/${block.audio.split("/").at(-1)!}` },
                  sha256: sha256(media.bytes),
                  byteLength: media.bytes.byteLength,
                  durationMs: media.durationMs,
                  legacyPublicPath: block.audio,
                  provenance: "Unchanged legacy public audio bytes",
                });
              }
              const transcriptRef = ref("transcript", `${block.id}-transcript`);
              const stimulusRef = ref("stimulus", `${block.id}-stimulus`);
              pub.transcripts.push({
                ...meta("transcript", transcriptRef.id),
                language: "en",
                text: block.transcript,
                segments: [],
              });
              pub.stimuli.push({
                ...meta("stimulus", stimulusRef.id),
                type: "listening",
                audioRef,
                transcriptRef,
                transcriptAccess: "always",
              });
              pub.blocks.push({
                ...base,
                type: block.type,
                stimulusRef,
                instruction: block.instruction,
              });
              break;
            }
            case "speaking":
              pub.blocks.push({
                ...base,
                type: block.type,
                prompt: block.prompt,
                modelAnswer: english(block.modelAnswer),
                checklist: block.checklist.map(english),
              });
              break;
            case "writing":
              pub.blocks.push({
                ...base,
                type: block.type,
                prompt: block.prompt,
                modelAnswer: english(block.modelAnswer),
                minWords: block.minWords,
                maxWords: block.maxWords,
              });
              break;
            case "quiz": {
              const assessmentRef = ref("assessment", assessmentId(block.id));
              assessmentRefs.push(assessmentRef);
              const exerciseRefs = block.questions.map((q) => ref("exercise", q.id));
              pub.blocks.push({ ...base, type: "quiz", exerciseRefs, assessmentRef });
              for (const q of block.questions) {
                // V1 skill is an area label. In particular q5 is writing recognition, not production.
                pub.exercises.push({
                  ...meta("exercise", q.id, source("question", q.id)),
                  type: "multiple_choice",
                  instructions: choose,
                  tags: { areas: [q.skill], coreSkills: [] },
                  difficulty: difficulty(),
                  objectiveRefs,
                  prompt: english(q.prompt),
                  selection: "single",
                  options: q.options.map((o) => ({ id: o.id, text: english(o.text) })),
                });
                pkg.private.grading.exerciseRules.push({
                  exerciseRef: ref("exercise", q.id),
                  gradingRevision: 1,
                  graderVersion: "multiple-choice-exact-set-v1",
                  type: "multiple_choice",
                  maxPoints: 1,
                  correctOptionIds: [q.correctOptionId],
                  scoring: "exact_set",
                  explanation: q.explanation,
                });
              }
              pub.assessments.push({
                ...meta("assessment", assessmentRef.id),
                purpose: "chapter_check",
                chapterRef,
                title: legacyText(
                  assessmentRef,
                  "/title",
                  source("block", block.id, "/title"),
                  block.title,
                ),
                instructions: choose,
                delivery: { lessonRef, blockRef },
                prerequisites: [],
                sections: [
                  {
                    id: `${assessmentRef.id}-section`,
                    title: legacyText(
                      assessmentRef,
                      "/sections/0/title",
                      source("block", block.id, "/title"),
                      block.title,
                    ),
                    exerciseRefs,
                    objectiveRefs,
                  },
                ],
                declaredCoverage: [],
                passSummary: bilingual(
                  `Answer every question and score at least ${block.passingPercent}%.`,
                  `မေးခွန်းအားလုံးကို ဖြေပြီး အနည်းဆုံး ${block.passingPercent}% ရရှိရမည်။`,
                ),
                feedbackTiming: "after_each_response",
              });
              pkg.private.grading.assessmentPolicies.push({
                assessmentRef,
                policyRevision: 1,
                aggregation: "legacy-rounded-percent-v1",
                requiredItems: exerciseRefs,
                itemWeights: exerciseRefs.map((exerciseRef) => ({ exerciseRef, weight: 1 })),
                passPercent: block.passingPercent,
                requireAllResponses: true,
                requireAllGrades: true,
                sectionMinimums: [],
              });
              break;
            }
          }
        }
      }
      pub.chapters.push({
        ...meta("chapter", chapter.id, source("chapter", chapter.id)),
        courseRef,
        slug: chapter.slug,
        order: chapter.order,
        title: legacyText(
          chapterRef,
          "/title",
          source("chapter", chapter.id, "/title"),
          chapter.title,
        ),
        description: chapter.description,
        objectiveRefs: chapterObjectiveRefs,
        prerequisites: [],
        lessonRefs: chapter.lessons.map((l) => ref("lesson", l.id)),
        assessmentRefs,
        coverageTargets: [],
      });
    }
  }
  // Mappings are reproducible candidates for review, never authorization to carry saved progress.
  for (const e of Object.values(pub).flat() as PublicEntity[])
    if (e.source && !e.source.pointer)
      pkg.compatibility.push({
        from: e.source,
        to: { contentVersion: pkg.manifest.contentVersion, ref: ref(e.kind, e.id, e.revision) },
        completion: e.kind === "lesson" ? "carry_forward" : "archive_only",
        evidence: e.kind === "exercise" ? "equivalent" : "none",
        resume: "same_ids",
        reason: "Deterministic v1 bridge candidate; review before activation",
        reviewStatus: "pending",
        fingerprints: { source: fingerprint(legacyValue(index, e.source)), target: fingerprint(e) },
      });
  for (const [collection, payload] of Object.entries(pub))
    pkg.manifest.files.push({
      collection: collection as keyof PublicCollections,
      path: `public/${collection}.json`,
      visibility: "public",
      sha256: sha256(canonicalJson(payload)),
      byteLength: Buffer.byteLength(canonicalJson(payload)),
    });
  for (const [collection, payload] of Object.entries(pkg.private))
    pkg.manifest.files.push({
      collection: collection as "grading" | "rubrics" | "transcripts",
      path: `private/${collection}.json`,
      visibility: "private",
      sha256: sha256(canonicalJson(payload)),
      byteLength: Buffer.byteLength(canonicalJson(payload)),
    });
  pkg.manifest.files.push({
    collection: "compatibility",
    path: "compatibility.json",
    visibility: "internal",
    sha256: sha256(canonicalJson(pkg.compatibility)),
    byteLength: Buffer.byteLength(canonicalJson(pkg.compatibility)),
  });
  for (const asset of pub.assets)
    if (asset.storage.type === "package")
      pkg.manifest.files.push({
        collection: "media",
        path: asset.storage.path,
        visibility: "public",
        sha256: asset.sha256,
        byteLength: asset.byteLength,
      });
  return pkg;
}
