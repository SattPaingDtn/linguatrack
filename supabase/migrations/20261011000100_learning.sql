begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.lesson_catalog (
  content_version text not null, lesson_id text not null, href text not null,
  block_ids text[] not null, quizzes jsonb not null,
  primary key (content_version, lesson_id)
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  last_lesson_id text, last_block_id text, content_version text,
  updated_at timestamptz, created_at timestamptz not null default now(),
  foreign key (content_version, last_lesson_id) references private.lesson_catalog(content_version, lesson_id)
);
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_version text not null, lesson_id text not null,
  completed_at timestamptz not null default now(),
  completion_source text not null check (completion_source in ('self_reported','quiz')),
  primary key (user_id, content_version, lesson_id),
  foreign key (content_version, lesson_id) references private.lesson_catalog(content_version, lesson_id)
);
create table public.quiz_attempts (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  content_version text not null, lesson_id text not null, quiz_id text not null, title text not null,
  total integer not null check (total > 0), answered integer not null default 0,
  correct integer not null default 0, percentage integer not null default 0,
  passed boolean not null default false,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique (id, user_id),
  check (answered between 0 and total and correct between 0 and answered and percentage between 0 and 100),
  check ((status = 'completed') = (completed_at is not null)),
  foreign key (content_version, lesson_id) references private.lesson_catalog(content_version, lesson_id)
);
create table public.exercise_responses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null, question_id text not null, skill text not null
    check (skill in ('listening','speaking','reading','writing','grammar','vocabulary')),
  prompt text not null, options jsonb not null, selected_option_id text not null, selected_text text not null,
  correct_option_id text not null, correct_text text not null, is_correct boolean not null,
  explanation jsonb not null, created_at timestamptz not null default now(),
  unique (attempt_id, question_id), unique (id, user_id),
  foreign key (attempt_id, user_id) references public.quiz_attempts(id, user_id) on delete cascade
);
create table public.mistake_reviews (
  response_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  reviewed_at timestamptz, created_at timestamptz not null default now(),
  foreign key (response_id, user_id) references public.exercise_responses(id, user_id) on delete cascade
);
create table public.study_sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz not null default now(), active_seconds integer not null default 0 check (active_seconds >= 0),
  last_sequence bigint not null default 0
);

alter table private.lesson_catalog enable row level security;
alter table public.profiles enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.exercise_responses enable row level security;
alter table public.mistake_reviews enable row level security;
alter table public.study_sessions enable row level security;
revoke all on private.lesson_catalog from public, anon, authenticated;
revoke all on public.profiles, public.lesson_progress, public.quiz_attempts, public.exercise_responses,
  public.mistake_reviews, public.study_sessions from public, anon, authenticated;
grant select on public.profiles, public.lesson_progress, public.quiz_attempts, public.exercise_responses,
  public.mistake_reviews, public.study_sessions to authenticated;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_progress on public.lesson_progress for select to authenticated using (user_id = (select auth.uid()));
create policy own_attempts on public.quiz_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy own_responses on public.exercise_responses for select to authenticated using (user_id = (select auth.uid()));
create policy own_mistakes on public.mistake_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy own_sessions on public.study_sessions for select to authenticated using (user_id = (select auth.uid()));

-- No direct browser writes. All mutations validate ownership and content atomically below.
create function private.immutable_record() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Published curriculum and exercise responses are immutable'; end;
$$;
create trigger immutable_catalog before update or delete on private.lesson_catalog for each row execute function private.immutable_record();
create trigger immutable_responses before update on public.exercise_responses for each row execute function private.immutable_record();
create function private.protect_finished_attempt() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'completed' then raise exception 'Completed attempts are immutable'; end if;
  return new;
end;
$$;
create trigger immutable_finished_attempt before update on public.quiz_attempts for each row execute function private.protect_finished_attempt();
create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values (new.id) on conflict do nothing; return new; end;
$$;
create trigger learning_profile_signup after insert on auth.users for each row execute function private.create_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create function private.attempt_snapshot(p_id uuid, p_owner uuid) returns jsonb
language sql stable set search_path = '' as $$
select jsonb_build_object(
  'id', a.id, 'quizId', a.quiz_id, 'lessonId', a.lesson_id, 'contentVersion', a.content_version,
  'title', a.title, 'correct', a.correct, 'total', a.total, 'answered', a.answered,
  'percentage', a.percentage, 'passed', a.passed, 'status', a.status,
  'timestamp', floor(extract(epoch from a.created_at)*1000),
  'completedAt', case when a.completed_at is null then null else floor(extract(epoch from a.completed_at)*1000) end,
  'answers', coalesce((select jsonb_object_agg(r.question_id, r.selected_option_id) from public.exercise_responses r where r.attempt_id = a.id and r.user_id = p_owner), '{}'::jsonb),
  'responses', coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'questionId', r.question_id, 'prompt', r.prompt, 'skill', r.skill, 'options', r.options,
    'selectedOptionId', r.selected_option_id, 'selectedText', r.selected_text,
    'correctOptionId', r.correct_option_id, 'correctText', r.correct_text,
    'isCorrect', r.is_correct, 'explanation', r.explanation,
    'timestamp', floor(extract(epoch from r.created_at)*1000)) order by r.created_at, r.question_id)
    from public.exercise_responses r where r.attempt_id = a.id and r.user_id = p_owner), '[]'::jsonb)
) from public.quiz_attempts a where a.id = p_id and a.user_id = p_owner;
$$;

create function public.learning_snapshot(p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profiles(id) values(uid) on conflict do nothing;
  select jsonb_build_object(
    'completed', coalesce((select jsonb_agg(p.lesson_id order by p.completed_at) from public.lesson_progress p where p.user_id = uid and p.content_version = p_version), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(private.attempt_snapshot(a.id, uid) order by a.created_at desc, a.id) from public.quiz_attempts a where a.user_id = uid), '[]'::jsonb),
    'profile', jsonb_build_object('lastLessonId', p.last_lesson_id, 'lastBlockId', p.last_block_id, 'contentVersion', p.content_version, 'updatedAt', p.updated_at),
    'mistakes', coalesce((select jsonb_agg(jsonb_build_object('responseId', m.response_id, 'reviewedAt', m.reviewed_at)) from public.mistake_reviews m where m.user_id = uid), '[]'::jsonb),
    'studySeconds', coalesce((select sum(s.active_seconds) from public.study_sessions s where s.user_id = uid), 0),
    'studySessionCount', (select count(*) from public.study_sessions s where s.user_id = uid)
  ) into result from public.profiles p where p.id = uid;
  return result;
end;
$$;

create function public.answer_question(p_attempt_id uuid, p_version text, p_lesson_id text, p_quiz_id text, p_question_id text, p_option_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); quiz jsonb; question jsonb; selected jsonb; correct_option jsonb;
  a public.quiz_attempts; previous public.exercise_responses; response_id uuid; num_answered integer; num_correct integer; pct integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select q into quiz from private.lesson_catalog l, lateral jsonb_array_elements(l.quizzes) q
    where l.content_version = p_version and l.lesson_id = p_lesson_id and q->>'id' = p_quiz_id;
  if quiz is null then raise exception 'Unknown quiz or curriculum version'; end if;
  select q into question from jsonb_array_elements(quiz->'questions') q where q->>'id' = p_question_id;
  if question is null then raise exception 'Unknown question'; end if;
  select o into selected from jsonb_array_elements(question->'options') o where o->>'id' = p_option_id;
  select o into correct_option from jsonb_array_elements(question->'options') o where o->>'id' = question->>'correctOptionId';
  if selected is null or correct_option is null then raise exception 'Unknown answer option'; end if;
  if (select count(*) from public.quiz_attempts where user_id = uid and created_at > now() - interval '1 hour') >= 100
    and not exists (select 1 from public.quiz_attempts where id = p_attempt_id and user_id = uid)
    then raise exception 'Too many attempts. Please try again later'; end if;
  insert into public.quiz_attempts(id, user_id, content_version, lesson_id, quiz_id, title, total)
    values(p_attempt_id, uid, p_version, p_lesson_id, p_quiz_id, quiz->>'title', jsonb_array_length(quiz->'questions'))
    on conflict (id) do nothing;
  select * into a from public.quiz_attempts where id = p_attempt_id and user_id = uid for update;
  if not found then raise exception 'Attempt unavailable' using errcode = '42501'; end if;
  if a.content_version <> p_version or a.lesson_id <> p_lesson_id or a.quiz_id <> p_quiz_id then raise exception 'Attempt content mismatch'; end if;
  select * into previous from public.exercise_responses where attempt_id = p_attempt_id and question_id = p_question_id;
  if found then
    if previous.selected_option_id <> p_option_id then raise exception 'Checked answers cannot be changed. Start a new attempt'; end if;
    return private.attempt_snapshot(p_attempt_id, uid); -- Safe retry after a lost HTTP acknowledgement.
  end if;
  if a.status = 'completed' then raise exception 'Attempt is already completed'; end if;
  insert into public.exercise_responses(user_id, attempt_id, question_id, skill, prompt, options, selected_option_id,
    selected_text, correct_option_id, correct_text, is_correct, explanation)
    values(uid, p_attempt_id, p_question_id, question->>'skill', question->>'prompt', question->'options', p_option_id,
      selected->>'text', correct_option->>'id', correct_option->>'text', p_option_id = correct_option->>'id', question->'explanation') returning id into response_id;
  if p_option_id <> correct_option->>'id' then insert into public.mistake_reviews(response_id, user_id) values(response_id, uid); end if;
  select count(*), count(*) filter (where is_correct) into num_answered, num_correct from public.exercise_responses where attempt_id = p_attempt_id;
  pct := round(num_correct::numeric * 100 / a.total);
  update public.quiz_attempts set answered = num_answered, correct = num_correct, percentage = pct,
    passed = num_answered = total and pct >= (quiz->>'passingPercent')::integer,
    status = case when num_answered = total then 'completed' else 'in_progress' end,
    completed_at = case when num_answered = total then now() else null end
    where id = p_attempt_id;
  return private.attempt_snapshot(p_attempt_id, uid);
end;
$$;

create function public.complete_lesson(p_version text, p_lesson_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); quizzes jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select l.quizzes into quizzes from private.lesson_catalog l where l.content_version = p_version and l.lesson_id = p_lesson_id;
  if not found then raise exception 'Unknown lesson or version'; end if;
  if exists (select 1 from jsonb_array_elements(quizzes) q where not exists (
    select 1 from public.quiz_attempts a where a.user_id = uid and a.content_version = p_version and a.lesson_id = p_lesson_id
      and a.quiz_id = q->>'id' and a.status = 'completed' and a.passed)) then raise exception 'Pass every required quiz before completing this lesson'; end if;
  insert into public.lesson_progress(user_id, content_version, lesson_id, completion_source)
    values(uid, p_version, p_lesson_id, case when jsonb_array_length(quizzes) > 0 then 'quiz' else 'self_reported' end) on conflict do nothing;
  return public.learning_snapshot(p_version);
end;
$$;

create function public.touch_position(p_version text, p_lesson_id text, p_block_id text, p_session_id uuid, p_sequence bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); blocks text[]; s public.study_sessions; elapsed integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select block_ids into blocks from private.lesson_catalog where content_version = p_version and lesson_id = p_lesson_id;
  if not found or (p_block_id is not null and not p_block_id = any(blocks)) then raise exception 'Unknown lesson section'; end if;
  insert into public.study_sessions(id, user_id) values(p_session_id, uid) on conflict do nothing;
  select * into s from public.study_sessions where id = p_session_id and user_id = uid for update;
  if not found then raise exception 'Study session unavailable' using errcode = '42501'; end if;
  if p_sequence <= s.last_sequence then return; end if;
  elapsed := case when now()-s.last_seen_at > interval '90 seconds' then 0 else least(30, greatest(0, floor(extract(epoch from now()-s.last_seen_at))::integer)) end;
  update public.study_sessions set active_seconds = active_seconds + elapsed, last_seen_at = now(), ended_at = now(), last_sequence = p_sequence where id = p_session_id;
  insert into public.profiles(id, last_lesson_id, last_block_id, content_version, updated_at)
    values(uid, p_lesson_id, p_block_id, p_version, now()) on conflict (id) do update set
      last_lesson_id = excluded.last_lesson_id, last_block_id = excluded.last_block_id,
      content_version = excluded.content_version, updated_at = excluded.updated_at;
end;
$$;
create function public.review_mistake(p_response_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.mistake_reviews set reviewed_at = coalesce(reviewed_at, now()) where response_id = p_response_id and user_id = auth.uid();
  if not found then raise exception 'Mistake unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.learning_export() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return jsonb_build_object('exportVersion', 1, 'exportedAt', now(), 'userId', uid,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'lessonProgress', coalesce((select jsonb_agg(to_jsonb(p)) from public.lesson_progress p where p.user_id = uid), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(private.attempt_snapshot(a.id,uid) order by a.created_at) from public.quiz_attempts a where a.user_id = uid), '[]'::jsonb),
    'mistakeReviews', coalesce((select jsonb_agg(to_jsonb(m)) from public.mistake_reviews m where m.user_id = uid), '[]'::jsonb),
    'studySessions', coalesce((select jsonb_agg(to_jsonb(s)) from public.study_sessions s where s.user_id = uid), '[]'::jsonb));
end;
$$;

-- Default function EXECUTE is PUBLIC: revoke it for every helper and RPC.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.learning_snapshot(text), public.answer_question(uuid,text,text,text,text,text),
  public.complete_lesson(text,text), public.touch_position(text,text,text,uuid,bigint), public.review_mistake(uuid), public.learning_export() from public, anon, authenticated;
grant execute on function public.learning_snapshot(text), public.answer_question(uuid,text,text,text,text,text),
  public.complete_lesson(text,text), public.touch_position(text,text,text,uuid,bigint), public.review_mistake(uuid), public.learning_export() to authenticated;
create index attempts_owner_time on public.quiz_attempts(user_id, created_at desc);
create index responses_owner on public.exercise_responses(user_id, attempt_id);
create index mistakes_owner on public.mistake_reviews(user_id, reviewed_at);
create index sessions_owner on public.study_sessions(user_id, last_seen_at desc);
commit;
