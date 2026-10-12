# Phase 2 persistence design

The implementation lives in `supabase/migrations/`, replacing the Phase 1 draft `phase-2-schema.sql`. **Do not apply that draft.** The visual design and curriculum routes are preserved.

## Trust boundaries

Next.js Route Handlers verify the Supabase user with `getUser()`, check same-origin JSON requests and validate strict Zod schemas. Next.js Proxy refreshes SSR cookies; APIs verify identity independently and never trust a client-supplied owner, score or correctness flag. Private responses use `Cache-Control: private, no-store` and vary on cookies.

RPCs run with a fixed empty search path and require `auth.uid()`. Owner IDs are obtained from the session. Personal-table DML is revoked from browser roles; mutations happen through narrowly scoped RPCs. RLS gives authenticated users SELECT access only to their own rows. Anonymous roles have neither personal-table access nor RPC execution. All helper function default PUBLIC execution is revoked. The private curriculum schema has no browser grants and is not exposed by the Data API.

A learner may call their own practice RPC directly, but it validates the same private versioned curriculum as the server. No service-role key or API with an owner override exists.

## Tables

| Table                    | Purpose / lifetime                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `profiles`               | Auth-owned profile and latest accepted lesson/section/version; signup trigger and existing-user backfill |
| `lesson_progress`        | One completion per owner/version/lesson; original timestamp and self-reported/quiz source                |
| `quiz_attempts`          | A new UUID per attempt; partial aggregates become immutable when all questions are answered              |
| `exercise_responses`     | Immutable checked-answer snapshots; unique attempt/question and composite owner foreign keys             |
| `mistake_reviews`        | Incorrect response and original owner; marking reviewed retains the original response                    |
| `study_sessions`         | Owner browser-tab session, capped heartbeat time and monotonic ordering                                  |
| `private.lesson_catalog` | Immutable published lesson/version metadata and canonical quizzes, inaccessible to browser roles         |

Account deletion cascades personal data. Migration `20261011000300_reset_learning.sql` adds confirmed owner-only learning resets. `reset_learning` deletes all of the current owner's learning records across releases and clears the profile position while retaining the auth account, profile and published curriculum. A private reset receipt stores only the owner, request ID, starting generation, content version and time for retry deduplication; it contains no deleted answers. Database administrators can manage accounts and backups separately.

## Transactions and retries

`answer_question` validates content, inserts or locks the owner attempt, prevents changed checked answers, writes the response and mistake record, updates the score and finalizes the attempt **in one transaction**. Retransmitting the same attempt/question/option returns the existing snapshot without duplicating history. Conflicting options are rejected. New attempts are limited to 100 per owner/hour. Finalized attempts are protected by a trigger; response updates and published catalog mutations are protected as well.

The browser queues an answer before network delivery and removes it only after acknowledgement. Drafts are scoped to user IDs. A successful commit with a lost HTTP reply can be replayed safely. A failed localStorage write blocks submission and preserves the selection on screen. On a new browser, only acknowledged data is available; unsynced drafts cannot cross devices. Refreshes cannot overwrite a newer in-tab acknowledged mutation with a stale loaded snapshot.

`complete_lesson` checks all required quizzes for an owner/version and inserts once. `touch_position` accepts only published sections, checks session ownership, and ignores older sequence values within a session. The latest accepted activity across sessions determines profile position. Time uses database timestamps, a 30-second cap per heartbeat and zero credit after gaps exceeding 90 seconds. Browser clocks order in-tab submissions; they do not calculate tracked study seconds. Multiple active devices may each contribute time, so activity is explicitly an estimate.

## Explicit learner reset

The existing My progress and nonempty Review history pages expose an accessible confirmation dialog. Learners must type `RESET`; the dialog explains permanent deletion, pending-draft disposal and export. `/api/learning/reset` requires same-origin strict JSON and a verified user; no client-supplied owner is accepted. Apply migration 003 once after 001/002 before restarting the updated app.

All learning mutations and resets lock the authenticated profile row. Each request carries the profile's learning generation; a successful reset increments it. Pre-reset requests from any device (including legacy requests defaulting to generation zero) are rejected after reset. The original mutation implementations move into the inaccessible private schema; their direct execution grants are revoked. Personal-table RLS and revoked direct writes stay intact. Normal completed attempts and checked responses remain immutable; explicit owner reset is their only app deletion path.

Reset uses a client-generated UUID receipt. A retry after a lost acknowledgement returns the current snapshot without deleting activity added after the original reset. Failed transactions roll back completely. The browser keeps its snapshot/drafts until the server confirms, then clears only that owner's older-generation drafts; drafts for other users or current-generation activity are retained. A refreshed device acknowledges a remote reset and reports disposal of stale drafts. In-flight pre-reset responses cannot repopulate the browser snapshot. A failed response may mean the reset committed: the UI says to retry the same reset or reload to inspect the outcome, rather than claiming nothing changed.

## History and proficiency

Responses snapshot the question and explanation at grading time; history never looks up today's answer keys to reinterpret yesterday's result. Completion applies to the current content version. History/export includes all versions. A retry uses current playable content; unavailable versions remain readable but have no misleading playable link.

Proficiency evidence uses the latest answer per `(quizId, questionId)` in the active version and known lessons. Lesson tags measure coverage only. Unscored areas display “Not assessed.” Multiple-choice recognition is labelled as limited formative evidence, including the writing item, rather than language production or a CEFR certification.

## Deployment validation

Apply migrations to a new/staging Supabase project, configure callback URLs and email delivery, then test two real accounts and two browsers. Verify signup/confirmation, sign-in/out, cookie refresh, reload/cross-device history, duplicate delivery after a disconnected request, queued recovery after reauthentication, denied foreign-owner reads/writes, and JSON export. Deploy API and seed content from the same release.

Automated SQL tests execute actual migrations with PostgreSQL in PGlite, recreating Supabase roles and `auth.uid()`; they test storage and policies, not the hosted auth/email service. Browser tests mock persistent APIs separately. No hosted credentials were supplied for this implementation.

References: [Supabase SSR client setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [advanced SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
