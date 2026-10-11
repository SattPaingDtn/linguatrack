-- ARCHIVED PHASE 1 DESIGN DRAFT. DO NOT APPLY. Use supabase/migrations/ instead.
-- DRAFT ONLY: not applied by Phase 1. Review with docs/phase-2-supabase.md.
-- Assumes a fresh Supabase database with auth.users and pgcrypto UUID support.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Learner',
  explanation_language text not null default 'my' check (explanation_language in ('en', 'my')),
  created_at timestamptz not null default now()
);
create table public.curriculum_releases (
  id uuid primary key default gen_random_uuid(),
  content_version text not null unique,
  schema_version integer not null check (schema_version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz
);
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.curriculum_releases(id),
  content_key text not null, slug text not null, title text not null,
  level text not null check (level in ('A1','A2','B1','B2','C1')),
  track text not null check (track in ('general-english','toeic','it-business-english')),
  description jsonb not null, outcomes jsonb not null,
  unique (release_id, content_key), unique (release_id, slug)
);
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  content_key text not null, slug text not null, title text not null,
  description jsonb not null, position integer not null check (position > 0),
  unique (course_id, content_key), unique (course_id, slug), unique (course_id, position)
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id),
  content_key text not null, slug text not null, title text not null,
  description jsonb not null, objectives jsonb not null,
  skills text[] not null check (cardinality(skills) > 0 and skills <@ array['listening','speaking','reading','writing']::text[]),
  areas text[] not null check (cardinality(areas) > 0 and areas <@ array['listening','speaking','reading','writing','grammar','vocabulary']::text[]),
  duration_minutes integer not null check (duration_minutes > 0),
  position integer not null check (position > 0),
  unique (chapter_id, content_key), unique (chapter_id, slug), unique (chapter_id, position)
);
create table public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id),
  content_key text not null, block_type text not null check (block_type in ('explanation','grammar','vocabulary','reading','listening','speaking','writing','quiz')),
  body jsonb not null, position integer not null check (position > 0),
  unique (lesson_id, content_key), unique (lesson_id, position), unique (id, lesson_id)
);
-- Answer keys must never be stored inside public.lesson_blocks.body.
create table private.quiz_answer_keys (
  block_id uuid primary key references public.lesson_blocks(id),
  grading_contract jsonb not null
);
create table public.enrollments (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  started_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id),
  status text not null check (status in ('in_progress','completed')),
  completion_source text check (completion_source in ('self_reported','assessed')),
  completed_at timestamptz, updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null, block_id uuid not null,
  responses jsonb not null, score numeric not null check (score between 0 and 100),
  passed boolean not null, created_at timestamptz not null default now(),
  foreign key (block_id, lesson_id) references public.lesson_blocks(id, lesson_id),
  unique (id, user_id)
);
create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  event_type text not null check (event_type in ('quiz_submitted','lesson_completed')),
  created_at timestamptz not null default now(),
  foreign key (attempt_id, user_id) references public.exercise_attempts(id, user_id) on delete cascade
);
create table public.learner_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id uuid not null references public.lesson_blocks(id),
  draft text not null default '' check (char_length(draft) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, block_id)
);

alter table public.profiles enable row level security;
alter table public.curriculum_releases enable row level security;
alter table public.courses enable row level security;
alter table public.chapters enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_blocks enable row level security;
alter table private.quiz_answer_keys enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.review_events enable row level security;
alter table public.learner_drafts enable row level security;

-- Explicitly remove any Supabase default table privileges before granting.
revoke all on public.profiles, public.curriculum_releases, public.courses, public.chapters,
  public.lessons, public.lesson_blocks, public.enrollments, public.lesson_progress,
  public.exercise_attempts, public.review_events, public.learner_drafts from public, anon, authenticated;
revoke all on private.quiz_answer_keys from public, anon, authenticated;
grant select on public.curriculum_releases, public.courses, public.chapters, public.lessons, public.lesson_blocks to anon, authenticated;
grant select on public.profiles, public.enrollments, public.lesson_progress, public.exercise_attempts, public.review_events, public.learner_drafts to authenticated;
grant update (display_name, explanation_language) on public.profiles to authenticated;
grant insert, delete on public.enrollments to authenticated;
grant insert, update, delete on public.learner_drafts to authenticated;
grant usage on schema private to service_role;
grant all on private.quiz_answer_keys to service_role;
grant all on public.profiles, public.curriculum_releases, public.courses, public.chapters,
  public.lessons, public.lesson_blocks, public.enrollments, public.lesson_progress,
  public.exercise_attempts, public.review_events, public.learner_drafts to service_role;

create policy published_release_read on public.curriculum_releases for select to anon, authenticated using (status = 'published');
create policy published_course_read on public.courses for select to anon, authenticated
  using (exists (select 1 from public.curriculum_releases r where r.id = release_id and r.status = 'published'));
-- Parent queries also run under the parent's published-only RLS policy.
create policy published_chapter_read on public.chapters for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id));
create policy published_lesson_read on public.lessons for select to anon, authenticated
  using (exists (select 1 from public.chapters c where c.id = chapter_id));
create policy published_block_read on public.lesson_blocks for select to anon, authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id));

create policy profile_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profile_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Create profiles in trusted signup code/trigger; no learner insert policy.
create policy enrollment_read on public.enrollments for select to authenticated using ((select auth.uid()) = user_id);
create policy enrollment_insert on public.enrollments for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.courses c where c.id = course_id));
create policy enrollment_delete on public.enrollments for delete to authenticated using ((select auth.uid()) = user_id);
create policy progress_read on public.lesson_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy attempt_read on public.exercise_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy review_read on public.review_events for select to authenticated using ((select auth.uid()) = user_id);
create policy draft_read on public.learner_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy draft_insert on public.learner_drafts for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.lesson_blocks b where b.id = block_id and b.block_type = 'writing'));
create policy draft_update on public.learner_drafts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.lesson_blocks b where b.id = block_id and b.block_type = 'writing'));
create policy draft_delete on public.learner_drafts for delete to authenticated using ((select auth.uid()) = user_id);
-- No private answer-key policies and no client policies for inserting scores.

create index courses_release_idx on public.courses(release_id);
create index chapters_course_idx on public.chapters(course_id);
create index lessons_chapter_idx on public.lessons(chapter_id);
create index blocks_lesson_idx on public.lesson_blocks(lesson_id);
create index attempts_user_time_idx on public.exercise_attempts(user_id, created_at desc);
create index attempts_block_idx on public.exercise_attempts(block_id, lesson_id);
create index reviews_user_time_idx on public.review_events(user_id, created_at desc);
create index reviews_attempt_owner_idx on public.review_events(attempt_id, user_id);
create index drafts_block_idx on public.learner_drafts(block_id);
create index enrollments_course_idx on public.enrollments(course_id);
create index progress_lesson_idx on public.lesson_progress(lesson_id);
commit;
