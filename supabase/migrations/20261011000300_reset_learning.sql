begin;

-- A generation prevents pre-reset requests/drafts on any device from restoring deleted history.
alter table public.profiles add column learning_generation integer not null default 0 check (learning_generation >= 0);
create table private.learning_resets (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  starting_generation integer not null,
  content_version text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table private.learning_resets enable row level security;
revoke all on private.learning_resets from public, anon, authenticated;

-- Retain the existing grading implementation, reachable only through guarded RPCs.
alter function public.learning_snapshot(text) set schema private;
alter function public.answer_question(uuid,text,text,text,text,text) set schema private;
alter function public.complete_lesson(text,text) set schema private;
alter function public.touch_position(text,text,text,uuid,bigint) set schema private;
alter function public.review_mistake(uuid) set schema private;
revoke all on function private.learning_snapshot(text), private.answer_question(uuid,text,text,text,text,text),
  private.complete_lesson(text,text), private.touch_position(text,text,text,uuid,bigint), private.review_mistake(uuid)
  from public, anon, authenticated;

create function private.guard_learning_generation(p_generation integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_generation integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select learning_generation into current_generation from public.profiles where id = uid for update;
  if not found or p_generation is distinct from current_generation then
    raise exception 'Learning history was reset. Reload to start again; pre-reset answers cannot be saved.' using errcode = '40001';
  end if;
  return uid;
end;
$$;

create function public.learning_snapshot(p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
  -- Use the same owner lock as mutations/reset, so the snapshot cannot mix generations.
  perform 1 from public.profiles where id = auth.uid() for update;
  result := private.learning_snapshot(p_version);
  return result || jsonb_build_object('generation', (select learning_generation from public.profiles where id = auth.uid()));
end;
$$;

-- Legacy requests default to generation zero and are rejected after the first reset.
create function public.answer_question(p_attempt_id uuid, p_version text, p_lesson_id text, p_quiz_id text,
  p_question_id text, p_option_id text, p_generation integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.guard_learning_generation(p_generation);
  return private.answer_question(p_attempt_id,p_version,p_lesson_id,p_quiz_id,p_question_id,p_option_id);
end;
$$;
create function public.complete_lesson(p_version text, p_lesson_id text, p_generation integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.guard_learning_generation(p_generation);
  perform private.complete_lesson(p_version,p_lesson_id);
  return public.learning_snapshot(p_version);
end;
$$;
create function public.touch_position(p_version text, p_lesson_id text, p_block_id text, p_session_id uuid,
  p_sequence bigint, p_generation integer default 0) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.guard_learning_generation(p_generation);
  perform private.touch_position(p_version,p_lesson_id,p_block_id,p_session_id,p_sequence);
end;
$$;
create function public.review_mistake(p_response_id uuid, p_generation integer default 0) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.guard_learning_generation(p_generation);
  perform private.review_mistake(p_response_id);
end;
$$;

create function public.reset_learning(p_request_id uuid, p_version text, p_generation integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); previous private.learning_resets;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'Reset request ID required'; end if;
  perform 1 from public.profiles where id = uid for update;
  select * into previous from private.learning_resets where user_id = uid and request_id = p_request_id;
  if found then
    if previous.starting_generation is distinct from p_generation or previous.content_version is distinct from p_version then
      raise exception 'Reset request mismatch';
    end if;
    return public.learning_snapshot(p_version); -- Lost acknowledgement: never delete new progress on retry.
  end if;
  perform private.guard_learning_generation(p_generation);
  if not exists (select 1 from private.lesson_catalog where content_version = p_version) then raise exception 'Unknown content version'; end if;
  delete from public.mistake_reviews where user_id = uid;
  delete from public.exercise_responses where user_id = uid;
  delete from public.quiz_attempts where user_id = uid;
  delete from public.lesson_progress where user_id = uid;
  delete from public.study_sessions where user_id = uid;
  update public.profiles set last_lesson_id = null, last_block_id = null, content_version = null,
    updated_at = now(), learning_generation = learning_generation + 1 where id = uid;
  insert into private.learning_resets(user_id,request_id,starting_generation,content_version)
    values(uid,p_request_id,p_generation,p_version);
  return public.learning_snapshot(p_version);
end;
$$;

revoke all on function private.guard_learning_generation(integer) from public, anon, authenticated;
revoke all on function public.learning_snapshot(text), public.answer_question(uuid,text,text,text,text,text,integer),
  public.complete_lesson(text,text,integer), public.touch_position(text,text,text,uuid,bigint,integer),
  public.review_mistake(uuid,integer), public.reset_learning(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.learning_snapshot(text), public.answer_question(uuid,text,text,text,text,text,integer),
  public.complete_lesson(text,text,integer), public.touch_position(text,text,text,uuid,bigint,integer),
  public.review_mistake(uuid,integer), public.reset_learning(uuid,text,integer) to authenticated;
commit;
