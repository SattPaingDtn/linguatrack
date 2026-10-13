# Codex instructions: A1 Chapters 4–6 (local-only)

Read the repository’s `docs/phase-3d-publishing-plan.md`, `docs/phase-3d-d2-report.md`, curriculum v2 schemas and existing course content first. The Markdown files are teacher authoring sources, **not** ready-to-import JSON.

1. Map existing chapter/lesson IDs to avoid duplicates. Preserve v1 and immutable drafts 1.1.0–1.3.0.
2. Convert each chapter’s 7 pedagogical sections to schema-supported lessons/blocks/exercises. Existing A1 1–3 content must remain intact. Use a **new unused** draft content version with exact revisions and mappings; do not overwrite archived versions.
3. Split the **PRIVATE TEACHER ANSWER KEY** from learner-facing content into server-only private grading rules. Do not serve raw Markdown to browsers.
4. The dialogues are scripts only. Either add verified audio assets and proper stimuli, or explicitly mark listening as `awaiting_audio` and do not assess listening. No fabricated audio or transcript-based listening credit.
5. Speaking and writing are self-practice, ungraded and unsaved unless supported workflows are separately implemented and reviewed. No CEFR award.
6. Implement development-only previews for each chapter, and render all 12 MCQs per chapter with working server-only answer checks if supported; show honest feature-unavailable messages rather than silent omission.
7. Validate schema, integrity, references, answer matching, private/public leakage, translation and content coverage. Test keyboard accessibility, small screens and history isolation.
8. Do not migrate hosted Supabase, activate releases, alter existing progress or create fake reviewer approvals.
9. Produce an integration report with preview URLs, chosen IDs, supported and unsupported activity types and review gates.

For an editable first iteration, start with Chapter 4 and review its local preview before batch-integrating 5 and 6.
