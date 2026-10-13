# A1 editorial completion checklist

This checklist distinguishes converted teaching sources from finished, approved learning releases. All source packs and drafts remain unapproved and inactive. No CEFR certification is implied.

| Chapter                            | Blueprint ID → actual v2 ID                            | Material available                                | Editorial / implementation status                                                   |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Greetings, Introductions & Jobs | `a1-ch01-outline` → `a1-chapter-1`                     | Seven source roles; eight existing lesson entries | Converted in 1.4.0; reused in 1.5.0; existing 1.4.0 preview retained                |
| 2. People, Family & Possessions    | `a1-ch02-outline` → `a1-chapter-2`                     | Seven complete editorial lesson sections          | Converted in 1.5.0; seven local preview lessons; actual audio pending               |
| 3. Daily Routines & Time           | `a1-ch03-outline` → `a1-chapter-3`                     | Seven complete editorial lesson sections          | Converted in 1.5.0; seven local preview lessons; actual audio pending               |
| 4. Home & Neighborhood             | `a1-ch04-outline` → `a1-chapter-4`                     | Seven bilingual source sections                   | Converted in 1.6.0; seven local previews; audio awaiting; not approved or published |
| 5. Food, Drinks & Shopping         | `a1-ch05-outline` → `a1-chapter-5`                     | Seven bilingual source sections                   | Converted in 1.7.0; seven local previews; audio awaiting; not approved or published |
| 6. Work & Study                    | `a1-ch06-outline` → `a1-chapter-6`                     | Seven bilingual source sections                   | Converted in 1.8.0; seven local previews; audio awaiting; not approved or published |
| 7. Hobbies & Free Time             | `a1-ch07-outline` (outline only; no curriculum entity) | Title, outcome and grammar focus only             | Not authored, not previewable, not finished or unlocked                             |
| 8. Travel & Directions             | `a1-ch08-outline` (outline only; no curriculum entity) | Title, outcome and grammar focus only             | Not authored, not previewable, not finished or unlocked                             |
| 9. Health & Everyday Needs         | `a1-ch09-outline` (outline only; no curriculum entity) | Title, outcome and grammar focus only             | Not authored, not previewable, not finished or unlocked                             |
| 10. Yesterday & Past Events        | `a1-ch10-outline` (outline only; no curriculum entity) | Title, outcome and grammar focus only             | Not authored, not previewable, not finished or unlocked                             |
| 11. Future Plans & Appointments    | `a1-ch11-outline` (outline only; no curriculum entity) | Title, outcome and grammar focus only             | Not authored, not previewable, not finished or unlocked                             |
| 12. A1 Integrated Review           | `a1-ch12-outline` (outline only; no curriculum entity) | Title, outcome and grammar focus only             | Not authored, not previewable, not finished or unlocked                             |

For Chapters 7–12 the blueprint proposes these grammar focuses only:

- Chapter 7: like/love + -ing; frequency adverbs — Discuss likes, interests and invitations.
- Chapter 8: movement prepositions; polite requests — Ask for directions and plan simple trips.
- Chapter 9: have got; should basics; need to — Explain simple needs and everyday problems.
- Chapter 10: past simple regular/irregular; was/were — Tell what happened yesterday.
- Chapter 11: going to; will basics; future time phrases — Arrange meetings and talk about plans.
- Chapter 12: A1 revision across all prior grammar — Practice integrated everyday communication.

## Actual content checks

- [x] Map all established Chapter 1 IDs/slugs before adding content; no Chapter 1 duplicate lessons.
- [x] Convert all seven sections in Chapters 2 and 3: vocabulary, grammar, scripts, speaking, reading, writing and formative review.
- [x] Chapters 2–3: keep 22 source MCQs per chapter separate from their private keys (12 knowledge, five reading, five audio-pending).
- [x] Preserve source Markdown/outline bytes and all earlier drafts; create exclusive, deterministic inactive 1.5.0.
- [x] Chapters 2–3 use `audio_pending`; Chapters 4–6 use `awaiting_audio`. No fabricated audio or listening-evidence awards.
- [x] Convert Chapters 4–6 sequentially: seven lessons, twelve MCQs, five ungraded reading responses and four unavailable listening prompts per chapter.
- [ ] Review Chapter 4 dialogue 1 key clarification and Chapter 5 some/any context note.
- [x] Provide unsaved/ungraded speaking and writing activities; expose no recording/upload/saving capability.
- [ ] Native Burmese and pedagogical review of new bilingual text and feedback.
- [ ] Review Chapter 2 K4 explicit pronoun context, Chapter 3 K10 neutral-adverb placement, and Chapter 2 determiner-rule correction.
- [ ] Supply reviewed pronunciation guides; fields currently state that they are pending.
- [ ] Supply licensed/authorized audio matching each script; design transcript access before listening assessment.
- [ ] Author unseen skill assessment material and a separately reviewed assessment policy; current review questions have no chapter pass threshold.
- [ ] Review all 55 inherited legacy locale exceptions and candidate-target compatibility proposals; no automatic approvals.
- [ ] Implement and independently test D3 storage/reset/export, D4 staging persistence and D5 controlled publishing gates before any production use.
- [ ] Author complete Chapters 7–12 before they can enter a learner catalog.

See `docs/a1-chapters-02-03-integration-report.md` for previews, tests and the publication boundary.

Chapters 4–6 were integrated sequentially after Chapter 4 local review. See `docs/a1-chapters-04-06-integration-report.md`. All four listening prompts per chapter remain unavailable without audio; five reading responses use ungraded self-review, and twelve MCQs are checkable locally.
