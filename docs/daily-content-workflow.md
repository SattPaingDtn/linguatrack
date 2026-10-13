# Daily versioned lesson workflow

Status: validation/public presentation foundations work locally. Daily published imports and the saved v2 main-site player are **pending**. This workflow uses the existing version 2 contracts, immutable registry and review gates; ordinary lessons should become data-only additions after their supported renderer/grader/storage capabilities are implemented and verified. Schema recognition alone does not make an activity usable.

1. **Map before authoring.** Check the existing course/chapter/lesson identities and slugs in the latest validated draft chain. Run `npm run platform:audit` for the read-only inventory. Current chain is 1.1.0–1.8.0; A1 has six chapters/43 lessons. Reuse existing greetings, be-verb and pronouns identities. Do not run a one-time generator into an existing draft or copy a lesson under another ID.
2. **Create an unused working version/directory.** At this inspection, 1.9.0 is unused; recheck before selecting it. Preserve the original draft/source directories. Keep v1 1.0.0 immutable. Author only in a new working tree/directory outside `src/content`, `public`, `supabase`, generated schemas and historical draft folders. Use existing authoring helpers/contracts rather than manually editing a validated package.
3. **Use exact structured public/private entities.** English instruction first and natural Burmese explanation; objective/prerequisite/skill/difficulty metadata; teaching blocks and public exercise choices/items; private answers/normalizers/rubrics/explanations. Public writing/speaking self-practice models are distinct from private assessment marking notes. Review translation accuracy. Preserve IDs/slugs; unchanged payloads reuse revisions, changed payloads get new revisions. Propagate exact reference changes through affected parents/deliveries and matching private grading revisions. Keep old rules, compatibility records and historical snapshots; never regrade old attempts in place.
4. **Declare only real capabilities/media.** For the current implemented persistence foundation, MCQ practice is tested in embedded databases; the v2 main player is not connected. Matching/blanks/ordering/comprehension graders and controls, assessment runtime, saved writing drafts and recordings need their separate platform milestones. Keep unsupported activities visible in review inventories, do not silently drop them or label them completed. Verify actual media bytes/hash/duration/reference; no placeholder audio URL. Current unsourced script lessons await audio; no listening proficiency. Public/private transcript access remains enforced.
5. **Validate against every ancestor, oldest first.** For a new working candidate (substitute its real directory):

   ```bash
   npm run curriculum:v2:validate -- content-authoring/new-working-candidate \
     --against .curriculum-drafts/1.1.0 \
     --against .curriculum-drafts/1.2.0 \
     --against .curriculum-drafts/1.3.0 \
     --against .curriculum-drafts/1.4.0 \
     --against .curriculum-drafts/1.5.0 \
     --against .curriculum-drafts/1.6.0 \
     --against .curriculum-drafts/1.7.0 \
     --against .curriculum-drafts/1.8.0
   npm run curriculum:v2:schemas:check
   npm run test:curriculum:v2
   npm run test:platform
   ```

   The candidate path is a placeholder, **not an existing approved package**. Validation checks IDs, exact revisions/ownership/graph references, option-answer mappings, private-key leakage, prerequisites, skill/evidence coverage, locale provenance, immutable conflicts and actual package media. Fix new work; never “fix” historical payloads or relax schemas to admit unsupported content.

6. **Evaluate compatibility explicitly.** Append proposed candidate mappings with source/target fingerprints and completion/evidence/resume decisions. Unchanged IDs are not automatic equivalence. Preserve historical scores/timestamps/versions/snapshots and all v1 queue submissions. Keep proposals pending until real independent review. Lesson participation or MCQ accuracy does not award CEFR proficiency; grammar recognition is not reading/listening assessment.
7. **Preview through the isolated local main-site adapter, when implemented.** This is pending M2/M3. Test the supported public blocks/exercises, bilingual layout, mobile navigation, real local save/refresh/re-login/two-user/reset/export and media. Existing development previews can still help editorial review but are not evidence of saved learning. Do not expose the private package, bulk graders or service credentials to clients.
8. **Seal an immutable candidate and obtain authenticated reviews.** Use the approved package-hash algorithm and retain the original bytes. Sealing/publish automation is still pending; do not manually claim it happened. D2 review sessions must be independently provisioned and hash-bound for translation/coverage/grading/compatibility. Author strings/`approvedBy` fields and test-fixture approvals are not authority. Changed bytes require a new unused version/hash and fresh review.
9. **Dry-run/inactive local staging.** Existing `curriculum:registry` tooling supports an exclusively created embedded local registry, validates sealed packages/ancestors/capabilities and rejects hash conflicts/leaks/invalid media/pending review gates. See `docs/phase-3d-d2-report.md` for exact local-only commands. No hosted importer or activation command exists yet. Do not bypass gates through admin inserts or treat an inactive release as public content.
10. **Publish only through the later authorized workflow.** Existing hosted project read-only preflight and verified local restore first; explicit hosted write authorization for migrations/import; then separate activation approval for the exact reviewed immutable hash. Run canary save/feedback/resume/two-owner tests and recovery/drain checks. Never change a historical attempt's version or delete history to roll back.

After the generic main player, graders and import/activation adapters are complete, a new lesson using **already implemented** block/exercise/media contracts should require only a new validated package and reviews, not UI code. A new exercise family, renderer block, media backend or grading semantic version remains an application capability change with its own tests. We do not claim the one-command daily publication workflow is implemented yet.
