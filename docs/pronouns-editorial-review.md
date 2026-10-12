# Subject Pronouns: controlled editorial pass

**Delivered:** inactive curriculum draft `1.3.0`, based on validated `1.2.0`. Both earlier drafts remain byte-identical. The live website, v1 curriculum, Supabase migrations and user learning records are unchanged; nothing was activated, published or imported.

## Exact content changes

The current authoring files remain `content-authoring/a1-subject-pronouns/public.json` and `grading.json`. Their original contents are retained byte-for-byte under `content-authoring/a1-subject-pronouns/revisions/1.2.0/`; the original prototype command/tests now use that frozen source so reproducing `1.2.0` cannot silently substitute revised content.

| Content                | Editorial change                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson description     | Clearer Burmese instructions; estimate increases from 20 to 25 minutes for added practice. Lesson teaching tags become grammar/writing, with reading removed.                                                                                                                                                                    |
| Overview               | Short paragraphs distinguish ကတ္တား (Subject), ကြိယာ (Verb), explicit English subjects and capitalization.                                                                                                                                                                                                                       |
| Pronoun reference      | One labelled Burmese line per pronoun; clearer singular/plural `you`, inclusive `we`, `it` and contextual `they`. English `he`/`she` descriptions are simpler. The original contextual-pronoun/animal and singular-`they` qualifications remain.                                                                                 |
| Be agreement           | Separate `I + am`, `he/she/it + is`, `you/we/they + are` lines, retaining article/adjective guidance.                                                                                                                                                                                                                            |
| Sentence patterns      | Four labelled examples distinguish `[I] + [read] + [books]`, `[We] + [like] + [tea]`, `[She] + [is] + [happy]` and `[I] + [am] + [a student]`. Plain-text labels and Burmese role explanations work without colour, images or a new block format. Imagining someone reading books or feeling happy gives concrete visual cues.   |
| Complement terminology | Uses “ဖြည့်စွက်ဖော်ပြသည့်အပိုင်း (Complement)” consistently. Explains that `happy` describes the subject and `a student` identifies the subject; these are not action objects. Keeps the place example and the fact that some complete sentences need no object.                                                                 |
| Common mistakes        | Retains all six original errors/corrections with shorter Burmese explanations. Scopes `I like tea` to `like` meaning “enjoy,” avoiding the valid simile interpretation of `I am like tea`.                                                                                                                                       |
| Existing objectives    | Clearer Burmese statements/criteria, retaining grammar recognition rather than comprehension/proficiency evidence.                                                                                                                                                                                                               |
| Question 12            | Stem becomes “Choose a statement that tells someone you are a student, not a question.” Distractor `option-1` becomes `Am I a student?`. `option-2` remains `I a student am.` and correct `option-3` remains `I am a student.` Feedback now explicitly distinguishes a question, a statement and incorrect word order.           |
| Other 13 questions     | English prompts, option identities, order and texts remain unchanged. All 14 correct option IDs and correct answer texts are unchanged.                                                                                                                                                                                          |
| Private feedback       | All 14 Burmese explanations are shortened/clarified. Only question 12's English feedback changes, matching its new punctuation and explicit statement task.                                                                                                                                                                      |
| Sentence production    | Adds `a1-c1-pronouns-sentence-practice`, the existing supported `writing` self-practice block, with a 4–30-word prompt to write two sentences: one SVO and one Be + Complement. Public models: `I like tea. She is happy.` Learners may use their own ideas. No submission, grade, private writing rule or persistence is added. |
| Practice objective     | Adds `a1-c1-subject-pronouns-objective-produce`, with action `produce` and expected evidence **only `self_practice`**. It does not claim demonstrated writing proficiency.                                                                                                                                                       |

The lesson's original ID `a1-c1-subject-pronouns`, slug `subject-pronouns-and-sentences`, six block IDs, three objective IDs, 14 question IDs and every option ID are preserved. The two new IDs above are the only entity additions. There are still four lessons and 19 exercises overall; block/objective counts increase to 16/24.

## Revisions, grading and compatibility

- Revised pronouns lesson, its six existing blocks, three recognition objectives and all 14 exercises: **revision 1 → 2**. Even unchanged English question payloads get a new exercise revision because their pinned private feedback or exact objective references changed.
- Paired private rules: **grading revision 1 → 2**. The algorithm remains `multiple-choice-exact-set-v1`; correct keys, selection order, one-point maximums and exact-set scoring are unchanged. No historical rule is overwritten.
- New writing block and self-practice objective: **revision 1**.
- Reciprocal exact references propagate changes to the A1 course/chapter, three earlier lessons, their nine blocks and original assessment: **revision 2 → 3**. Original assessment policy becomes revision 3 for its updated reference. Its five questions and 80% behavior remain unchanged. Legacy questions/rules remain revision 1; A2–C1, media, transcripts and stimuli are unchanged.
- All **94 original mappings** are retained exactly. New target-version mappings are appended, resulting in **237 entries**. Historical targets resolve against verified `1.1.0`/`1.2.0` registry snapshots, not substituted current payloads.
- The revised pronouns lesson is conservatively marked `requires_recompletion` / `restart_with_notice` for future activation review because it adds an objective/activity. This does not delete or rewrite a historical completion. Its prior result remains pinned to the earlier version.
- Question 12 is conservatively `not_equivalent` for automatic evidence carry because its task/distractor changed. The other 13 unchanged recognition items retain equivalent-evidence candidates. All new mappings are pending review; no editorial authorization is fabricated. The original three lessons remain structurally compatible with saved legacy progress/attempts/resume.

## Reading and writing evidence

All 14 questions have only `grammar` area tags, no core-skill tags, and recognition objectives. The revised lesson has no reading tag and adds no reading-comprehension exercise. Tests exercising the existing progress calculation with all 14 correct responses return **grammar: 14, reading: 0, writing: 0**; lesson completion is separate. Attempts to claim comprehension coverage from those items or graded writing evidence from the self-practice block fail package validation. CEFR awarding remains disabled.

## Files and reproducibility

New tooling: `src/lib/curriculum/v2/editorial.ts`, `registry.ts`, `scripts/curriculum/edit-pronouns.ts` and `tests/curriculum-v2/editorial.test.ts`. `files.ts` adds read-only ancestor-chain loading and the validation CLI accepts repeated `--against` flags. `package.json` adds `curriculum:v2:edit-pronouns`. Existing prototype inputs/tests point at the frozen `1.2.0` authoring snapshots. Three process-heavy CLI integration cases use explicit 30-second test limits; their preservation/security assertions are unchanged.

Only these 10 package files differ between the delivered `1.2.0` and `1.3.0`: `manifest.json`, `compatibility.json`, `private/grading.json`, and `public/{courses,chapters,lessons,blocks,objectives,exercises,assessments}.json`. The other six files are byte-identical. Draft directories remain ignored by Git; the authored source/tooling reproduces them.

Validate all exact references and ancestry:

```bash
npm run curriculum:v2:validate -- .curriculum-drafts/1.3.0 \
  --against .curriculum-drafts/1.1.0 \
  --against .curriculum-drafts/1.2.0 --json
npm run test:curriculum:v2
npm run check
npm run test:e2e
```

Reproduce into another **new** directory; the delivered `1.3.0` already exists and cannot be overwritten:

```bash
npm run curriculum:v2:edit-pronouns -- \
  --source .curriculum-drafts/1.2.0 \
  --against .curriculum-drafts/1.1.0 \
  --out .curriculum-drafts/1.3.0-reproduction
```

The date is fixed to 2026-10-12 for deterministic reproduction. The helper is scoped to this lesson and the existing unsharded/PCM-WAV package layout, not a general editor/publisher.

```text
1.1.0: d3bc6e336d3cf25ee74eb8cf7c1ce69e6a4cff9aefea9a2d99ed833d7648a668
1.2.0: c37cbacb93e1591f1b95d0473ac30f59895d3b9e05e50561330d58ee3297a755
1.3.0: 0cd246e24490e47a7bd20dab73ffe802a0e95f76cb1f3cf14aaf1b84d0de7029
```

## Verification and editorial decisions

**Passed:** validation of all three packages; 40 curriculum tests, 85 total tests, 14 desktop/mobile browser tests, lint, type-check, production build, v1 integrity and generated schema checks. Reproduction of 1.3.0 is byte-identical.

Checks cover exact keys/correct text, uniqueness/references/revisions, public key exclusion, forged key/revision rejection, historical mapping hashes, immutable source/output protection, duplicate registry conflicts, zero reading/writing evidence from grammar MCQs, ungraded production and legacy saved-result/timestamp preservation. Full security regressions include owner isolation, immutable repeated attempts, forged submissions, initial-payload key exclusion and reset/outbox behavior. PostgreSQL tests are isolated PGlite tests; hosted data is neither inspected nor migrated. Browser regressions use the existing preview/mocked API build.

There is no blocking editorial decision for this draft. Deliberate conservative choices are the lesson re-practice notice, non-equivalent Q12 mapping and retained contextual/singular-`they` note. A final human review of the new Burmese register and compatibility choices remains a publication-stage decision; no native-speaker sign-off, formal proficiency alignment or release approval is claimed. The new lesson is still not visible in the live v1 website.
