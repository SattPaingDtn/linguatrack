-- D3 only: additive storage/read/reset foundation. LOCAL/ISOLATED TESTS ONLY.
-- No writer role/RPC, content import, active release or learner delivery is enabled.
begin;
do $$ begin
  if to_regprocedure('public.reset_learning(uuid,text,integer)') is null
    or to_regprocedure('private.guard_learning_generation(integer)') is null
    or to_regclass('curriculum_private.releases') is null
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='profiles' and column_name='learning_generation') then
    raise exception 'D3 requires verified v1/reset and D2 registry prerequisites';
  end if;
end $$;

create function private.v2_member(p_hash text,p_kind text,p_id text,p_revision integer) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from curriculum_private.artifact_entities a
    join curriculum_private.entities e using(kind,entity_id,revision)
    where a.package_hash=p_hash and a.kind=p_kind and a.entity_id=p_id and a.revision=p_revision
      and e.visibility='public');
$$;
create function private.v2_edge(p_hash text,p_kind text,p_id text,p_revision integer,
  p_target_kind text,p_target_id text,p_target_revision integer) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from curriculum_private.entity_references where package_hash=p_hash
    and source_kind=p_kind and source_id=p_id and source_revision=p_revision
    and target_kind=p_target_kind and target_id=p_target_id and target_revision=p_target_revision);
$$;

create table public.learning_v2_attempts (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0),
  release_hash text not null references curriculum_private.releases(package_hash),
  content_version text not null,
  lesson_id text not null, lesson_revision integer not null check(lesson_revision>0),
  delivery_kind text not null check(delivery_kind in ('block','assessment')),
  delivery_id text not null, delivery_revision integer not null check(delivery_revision>0),
  mode text not null check(mode in ('practice','assessment')),
  required_exercises jsonb not null check(jsonb_typeof(required_exercises)='array'
    and jsonb_array_length(required_exercises) between 1 and 1000),
  runtime_version text not null check(length(runtime_version) between 1 and 120),
  created_at timestamptz not null default now(),
  unique(id,user_id,generation,release_hash)
);
create table public.learning_v2_responses (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0), release_hash text not null,
  attempt_id uuid not null,
  exercise_id text not null, exercise_revision integer not null check(exercise_revision>0),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check(jsonb_typeof(response)='object' and octet_length(response::text)<=32768),
  prompt_snapshot text not null check(length(prompt_snapshot) between 1 and 20000),
  options_snapshot jsonb not null check(jsonb_typeof(options_snapshot)='array'),
  evidence_construct text not null default 'recognition' check(evidence_construct in
    ('recognition','reading_comprehension','listening_comprehension','writing_production','speaking_production')),
  assistance text[] not null default '{}', created_at timestamptz not null default now(),
  unique(attempt_id,exercise_id,exercise_revision), unique(id,user_id,generation,release_hash),
  foreign key(attempt_id,user_id,generation,release_hash)
    references public.learning_v2_attempts(id,user_id,generation,release_hash) on delete cascade
);
create table public.learning_v2_grades (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0), release_hash text not null,
  response_id uuid not null, previous_grade_id uuid unique,
  status text not null check(status in ('graded','pending_review')),
  source text not null check(source in ('automatic','human')),
  points integer, max_points integer not null check(max_points>0), is_correct boolean,
  feedback jsonb not null check(jsonb_typeof(feedback)='object'),
  created_at timestamptz not null default now(),
  unique(id,user_id,generation,release_hash,response_id),
  foreign key(response_id,user_id,generation,release_hash)
    references public.learning_v2_responses(id,user_id,generation,release_hash) on delete cascade,
  foreign key(previous_grade_id,user_id,generation,release_hash,response_id)
    references public.learning_v2_grades(id,user_id,generation,release_hash,response_id) on delete cascade,
  check((status='pending_review' and points is null and is_correct is null) or
    (status='graded' and points between 0 and max_points and is_correct is not null))
);
create unique index v2_first_grade on public.learning_v2_grades(response_id) where previous_grade_id is null;
create table public.learning_v2_attempt_results (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0), release_hash text not null,
  attempt_id uuid not null, previous_result_id uuid unique,
  points integer not null check(points>=0), max_points integer not null check(max_points>0 and points<=max_points),
  correct integer not null check(correct>=0), total integer not null check(total>0 and correct<=total),
  percentage integer not null check(percentage between 0 and 100), passed boolean,
  policy_revision integer check(policy_revision>0), policy_hash text check(policy_hash ~ '^[a-f0-9]{64}$'),
  runtime_version text not null, created_at timestamptz not null default now(),
  unique(id,user_id,generation,release_hash), unique(id,user_id,generation,release_hash,attempt_id),
  foreign key(attempt_id,user_id,generation,release_hash)
    references public.learning_v2_attempts(id,user_id,generation,release_hash) on delete cascade,
  foreign key(previous_result_id,user_id,generation,release_hash,attempt_id)
    references public.learning_v2_attempt_results(id,user_id,generation,release_hash,attempt_id) on delete cascade
);
create unique index v2_first_result on public.learning_v2_attempt_results(attempt_id) where previous_result_id is null;
create table public.learning_v2_completion_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0),
  release_hash text not null references curriculum_private.releases(package_hash),
  lesson_id text not null, lesson_revision integer not null check(lesson_revision>0),
  source text not null check(source in ('self_reported','assessment_pass')),
  result_id uuid, created_at timestamptz not null default now(),
  unique(user_id,generation,release_hash,lesson_id,lesson_revision),
  foreign key(result_id,user_id,generation,release_hash)
    references public.learning_v2_attempt_results(id,user_id,generation,release_hash) on delete cascade,
  check((source='self_reported' and result_id is null) or (source='assessment_pass' and result_id is not null))
);
-- Compatibility carry remains read-only in D3. No author-approved mapping can mint completions.
create table public.learning_v2_mistakes (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0), release_hash text not null,
  response_id uuid not null, grade_id uuid not null unique, created_at timestamptz not null default now(),
  unique(id,user_id,generation,release_hash),
  foreign key(grade_id,user_id,generation,release_hash,response_id)
    references public.learning_v2_grades(id,user_id,generation,release_hash,response_id) on delete cascade
);
create table public.learning_v2_review_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0), release_hash text not null,
  mistake_id uuid not null, action text not null check(action in ('reviewed','retry_planned')),
  created_at timestamptz not null default now(),
  foreign key(mistake_id,user_id,generation,release_hash)
    references public.learning_v2_mistakes(id,user_id,generation,release_hash) on delete cascade
);
create table public.learning_v2_resume (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0),
  release_hash text not null references curriculum_private.releases(package_hash),
  lesson_id text not null, lesson_revision integer not null check(lesson_revision>0),
  block_id text, block_revision integer, step text not null check(step in ('learn','practice','review')),
  exercise_id text, exercise_revision integer,
  session_id uuid not null, sequence bigint not null check(sequence>=0),
  navigation_order bigint not null check(navigation_order>0),
  accepted_at timestamptz not null default now(),
  check((block_id is null)=(block_revision is null)), check(block_revision>0),
  check((exercise_id is null)=(exercise_revision is null)), check(exercise_revision>0)
);
create table public.learning_v2_study_sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>=0), started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), active_seconds integer not null default 0 check(active_seconds>=0),
  last_sequence bigint not null default 0 check(last_sequence>=0), check(last_seen_at>=started_at)
);
-- No browser access to runtime/binding receipts; D4 must provision a separate restricted writer.
create table private.learning_v2_bindings (
  response_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null, release_hash text not null,
  exercise_kind text not null default 'exercise' check(exercise_kind='exercise'),
  exercise_id text not null, exercise_revision integer not null,
  grading_hash text not null check(grading_hash ~ '^[a-f0-9]{64}$'),
  foreign key(response_id,user_id,generation,release_hash)
    references public.learning_v2_responses(id,user_id,generation,release_hash) on delete cascade,
  foreign key(exercise_kind,exercise_id,exercise_revision)
    references curriculum_private.grading_bindings(kind,entity_id,revision)
);
create table private.learning_v2_receipts (
  response_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null, release_hash text not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
  foreign key(response_id,user_id,generation,release_hash)
    references public.learning_v2_responses(id,user_id,generation,release_hash) on delete cascade
);
create table private.learning_navigation_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade, generation integer not null,
  schema_version integer not null check(schema_version in (1,2)), content_version text not null,
  release_hash text references curriculum_private.releases(package_hash),
  lesson_id text not null, lesson_revision integer, block_id text, block_revision integer,
  step text, exercise_id text, exercise_revision integer,
  source text not null check(source in ('legacy_baseline','v1_position_change','v2_navigation')),
  accepted_at timestamptz not null default now()
);
create table private.learning_v2_grade_audit (
  grade_id uuid primary key, response_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null, release_hash text not null,
  principal name not null, recorded_at timestamptz not null default clock_timestamp(),
  foreign key(grade_id,user_id,generation,release_hash,response_id)
    references public.learning_v2_grades(id,user_id,generation,release_hash,response_id) on delete cascade
);

create function private.v2_guard_record() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_generation integer; entity jsonb; parent public.learning_v2_attempts;
  r jsonb; keys text[]; grade public.learning_v2_grades; resp public.learning_v2_responses;
  result public.learning_v2_attempt_results; binding curriculum_private.grading_bindings;
begin
  select learning_generation into current_generation from public.profiles where id=new.user_id for update;
  if not found or new.generation is distinct from current_generation then
    raise exception 'Stale learning generation' using errcode='40001';
  end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.generation<>old.generation) then
    raise exception 'Learning owner/generation cannot change' using errcode='42501';
  end if;
  if tg_table_name='learning_v2_attempts' then
    if new.content_version is distinct from (select content_version from curriculum_private.artifacts where package_hash=new.release_hash)
      or not private.v2_member(new.release_hash,'lesson',new.lesson_id,new.lesson_revision)
      or not private.v2_member(new.release_hash,new.delivery_kind,new.delivery_id,new.delivery_revision) then
      raise exception 'Exact release reference required';
    end if;
    if new.delivery_kind='block' and not private.v2_edge(new.release_hash,'lesson',new.lesson_id,new.lesson_revision,'block',new.delivery_id,new.delivery_revision) then
      raise exception 'Delivery does not belong to lesson';
    end if;
    if new.delivery_kind='assessment' then
      select payload into entity from curriculum_private.entities where kind='assessment' and entity_id=new.delivery_id and revision=new.delivery_revision;
      if entity#>>'{delivery,lessonRef,id}' is distinct from new.lesson_id or (entity#>>'{delivery,lessonRef,revision}')::integer is distinct from new.lesson_revision then
        raise exception 'Assessment delivery does not belong to lesson';
      end if;
    end if;
    if (select count(distinct value) from jsonb_array_elements(new.required_exercises))<>jsonb_array_length(new.required_exercises) then raise exception 'Duplicate required exercises'; end if;
    for r in select value from jsonb_array_elements(new.required_exercises) loop
      if jsonb_typeof(r)<>'object' or r->>'kind' is distinct from 'exercise'
        or (select count(*) from jsonb_object_keys(r))<>3
        or not private.v2_member(new.release_hash,'exercise',r->>'id',(r->>'revision')::integer)
        or not private.v2_edge(new.release_hash,new.delivery_kind,new.delivery_id,new.delivery_revision,'exercise',r->>'id',(r->>'revision')::integer) then
        raise exception 'Required exercise is not a delivery member';
      end if;
    end loop;
  elsif tg_table_name='learning_v2_responses' then
    select * into parent from public.learning_v2_attempts where id=new.attempt_id and user_id=new.user_id;
    if not found or not parent.required_exercises @> jsonb_build_array(jsonb_build_object('kind','exercise','id',new.exercise_id,'revision',new.exercise_revision)) then
      raise exception 'Response is not in the pinned required exercises';
    end if;
    if exists(select 1 from public.learning_v2_attempt_results where attempt_id=new.attempt_id) then raise exception 'Finalized attempt is immutable'; end if;
    select payload into entity from curriculum_private.entities where kind='exercise' and entity_id=new.exercise_id and revision=new.exercise_revision;
    if new.response->>'type' is distinct from entity->>'type' or new.response->>'type'='speaking_recording' then raise exception 'Response type unavailable'; end if;
    keys:=case new.response->>'type' when 'multiple_choice' then array['type','optionIds'] when 'matching' then array['type','pairs']
      when 'fill_in_blank' then array['type','values'] when 'sentence_ordering' then array['type','tokenIds'] when 'writing_submission' then array['type','text'] else null end;
    if keys is null or (new.response-keys)<>'{}'::jsonb or (select count(*) from jsonb_object_keys(new.response))<>2 then raise exception 'Unsafe response fields'; end if;
    if new.response->>'type'='multiple_choice' then
      if jsonb_typeof(new.response->'optionIds') is distinct from 'array' or jsonb_array_length(new.response->'optionIds')<1
        or jsonb_array_length(new.response->'optionIds')>12
        or (select count(distinct value) from jsonb_array_elements(new.response->'optionIds'))<>jsonb_array_length(new.response->'optionIds') then raise exception 'Invalid selected options'; end if;
      if entity->>'selection'='single' and jsonb_array_length(new.response->'optionIds')<>1 then raise exception 'Single selection required'; end if;
      for r in select value from jsonb_array_elements(new.response->'optionIds') loop
        if not exists(select 1 from jsonb_array_elements(entity->'options') o where o->'id'=r) then raise exception 'Unknown selected option'; end if;
      end loop;
      if new.prompt_snapshot is distinct from entity#>>'{prompt,text}' or new.options_snapshot is distinct from
        (select jsonb_agg(jsonb_build_object('id',o->>'id','text',o#>>'{text,text}')) from jsonb_array_elements(entity->'options') o) then raise exception 'Public task snapshot mismatch'; end if;
    end if;
    if new.response->>'type' in ('matching','fill_in_blank') then
      r:=new.response->case when new.response->>'type'='matching' then 'pairs' else 'values' end;
      if jsonb_typeof(r) is distinct from 'array' or jsonb_array_length(r) not between 1 and 50 then raise exception 'Invalid response items'; end if;
      for r in select value from jsonb_array_elements(r) loop
        keys:=case when new.response->>'type'='matching' then array['leftId','rightId'] else array['blankId','text'] end;
        if jsonb_typeof(r)<>'object' or (r-keys)<>'{}'::jsonb or (select count(*) from jsonb_object_keys(r))<>2
          or jsonb_typeof(r->keys[1]) is distinct from 'string' or jsonb_typeof(r->keys[2]) is distinct from 'string' then raise exception 'Unsafe response item'; end if;
      end loop;
    elsif new.response->>'type'='sentence_ordering' then
      if jsonb_typeof(new.response->'tokenIds') is distinct from 'array' or jsonb_array_length(new.response->'tokenIds') not between 2 and 100
        or exists(select 1 from jsonb_array_elements(new.response->'tokenIds') token where jsonb_typeof(token)<>'string') then raise exception 'Invalid ordering response'; end if;
    elsif new.response->>'type'='writing_submission' then
      if jsonb_typeof(new.response->'text') is distinct from 'string' or length(new.response->>'text') not between 1 and 20000 then raise exception 'Invalid writing submission'; end if;
    end if;
    if new.response->>'type'<>'writing_submission' and new.evidence_construct<>'recognition' then raise exception 'Comprehension/production evidence is not enabled in D3'; end if;
    if new.response->>'type'='writing_submission' and new.evidence_construct<>'writing_production' then raise exception 'Writing production context required'; end if;
    for r in select value from jsonb_array_elements(new.options_snapshot) loop
      if jsonb_typeof(r)<>'object' or (r-array['id','text'])<>'{}'::jsonb or jsonb_typeof(r->'id') is distinct from 'string'
        or jsonb_typeof(r->'text') is distinct from 'string' then raise exception 'Unsafe public option snapshot'; end if;
    end loop;
    if cardinality(new.assistance)>20 or not new.assistance <@ array['transcript_viewed','model_answer_viewed','translation_viewed','hint_viewed'] then raise exception 'Invalid assistance markers'; end if;
  elsif tg_table_name='learning_v2_grades' then
    if (new.feedback-array['en','my','correctAnswer'])<>'{}'::jsonb
      or jsonb_typeof(new.feedback->'en') is distinct from 'string' or jsonb_typeof(new.feedback->'my') is distinct from 'string'
      or (new.feedback ? 'correctAnswer' and jsonb_typeof(new.feedback->'correctAnswer')<>'string')
      or octet_length(new.feedback::text)>32768 then raise exception 'Unsafe feedback projection'; end if;
    select * into resp from public.learning_v2_responses where id=new.response_id and user_id=new.user_id;
    select * into parent from public.learning_v2_attempts where id=resp.attempt_id;
    if parent.mode='assessment' then raise exception 'Assessment grading is not enabled in D3'; end if;
    select * into binding from curriculum_private.grading_bindings where kind='exercise' and entity_id=resp.exercise_id and revision=resp.exercise_revision;
    if not exists(select 1 from private.learning_v2_bindings where response_id=new.response_id and user_id=new.user_id)
      or new.max_points is distinct from (binding.payload->>'maxPoints')::integer then raise exception 'Exact private grading binding required'; end if;
    if new.status='pending_review' and new.feedback ? 'correctAnswer' then raise exception 'Pending review cannot reveal a correct answer'; end if;
    if resp.response->>'type'='writing_submission' and new.source='automatic' then raise exception 'Writing requires human review'; end if;
    if new.previous_grade_id is not null and exists(select 1 from public.learning_v2_grades where previous_grade_id=new.previous_grade_id) then raise exception 'Grade correction must extend the current decision'; end if;
  elsif tg_table_name='learning_v2_completion_events' then
    if not private.v2_member(new.release_hash,'lesson',new.lesson_id,new.lesson_revision) then raise exception 'Exact lesson required'; end if;
    select payload into entity from curriculum_private.entities where kind='lesson' and entity_id=new.lesson_id and revision=new.lesson_revision;
    if entity#>>'{completionPolicy,type}' is distinct from new.source then raise exception 'Completion source does not match lesson policy'; end if;
    if new.source='assessment_pass' then
      select * into result from public.learning_v2_attempt_results where id=new.result_id and user_id=new.user_id;
      select * into parent from public.learning_v2_attempts where id=result.attempt_id;
      if result.passed is distinct from true or parent.lesson_id<>new.lesson_id or parent.lesson_revision<>new.lesson_revision
        or parent.delivery_kind<>'assessment' or parent.delivery_id is distinct from entity#>>'{completionPolicy,assessmentRef,id}'
        or parent.delivery_revision is distinct from (entity#>>'{completionPolicy,assessmentRef,revision}')::integer then raise exception 'Passing pinned assessment required'; end if;
    end if;
  elsif tg_table_name='learning_v2_mistakes' then
    select * into grade from public.learning_v2_grades where id=new.grade_id;
    if grade.is_correct is distinct from false then raise exception 'Mistake requires an incorrect grade'; end if;
  elsif tg_table_name='learning_v2_resume' then
    if not private.v2_member(new.release_hash,'lesson',new.lesson_id,new.lesson_revision)
      or (new.block_id is not null and not private.v2_edge(new.release_hash,'lesson',new.lesson_id,new.lesson_revision,'block',new.block_id,new.block_revision))
      or (new.exercise_id is not null and (new.block_id is null or not private.v2_edge(new.release_hash,'block',new.block_id,new.block_revision,'exercise',new.exercise_id,new.exercise_revision))) then raise exception 'Resume reference not in lesson'; end if;
    if tg_op='UPDATE' and (new.navigation_order<=old.navigation_order or (new.session_id=old.session_id and new.sequence<=old.sequence)) then raise exception 'Stale navigation' using errcode='40001'; end if;
    new.accepted_at:=clock_timestamp();
  elsif tg_table_name='learning_v2_study_sessions' and tg_op='UPDATE' then
    if new.id<>old.id or new.started_at<>old.started_at or new.last_sequence<=old.last_sequence or new.active_seconds<old.active_seconds
      or new.active_seconds-old.active_seconds>30 or new.last_seen_at<old.last_seen_at then raise exception 'Invalid study heartbeat'; end if;
  elsif tg_table_name='learning_v2_bindings' then
    select * into resp from public.learning_v2_responses where id=new.response_id;
    select * into binding from curriculum_private.grading_bindings where kind='exercise' and entity_id=new.exercise_id and revision=new.exercise_revision;
    if new.grading_hash is distinct from binding.payload_hash or new.exercise_id is distinct from resp.exercise_id
      or new.exercise_revision is distinct from resp.exercise_revision then raise exception 'Grading binding mismatch'; end if;
  elsif tg_table_name='learning_v2_receipts' then
    if new.request_hash is distinct from (select request_hash from public.learning_v2_responses where id=new.response_id) then raise exception 'Receipt request mismatch'; end if;
  end if;
  return new;
end $$;

create function private.v2_guard_result() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.learning_v2_attempts; num integer; pts integer; maximum integer; num_correct integer;
begin
  select * into a from public.learning_v2_attempts where id=new.attempt_id and user_id=new.user_id;
  select count(*),sum(g.points),sum(g.max_points),count(*) filter(where g.is_correct) into num,pts,maximum,num_correct
    from public.learning_v2_responses r join public.learning_v2_grades g on g.response_id=r.id
    where r.attempt_id=a.id and g.status='graded' and not exists(select 1 from public.learning_v2_grades next where next.previous_grade_id=g.id);
  if num is distinct from jsonb_array_length(a.required_exercises) or new.total is distinct from num or new.points is distinct from pts
    or new.max_points is distinct from maximum or new.correct is distinct from num_correct
    or new.percentage is distinct from round(pts::numeric*100/maximum)::integer then raise exception 'Result requires all committed grades and exact totals'; end if;
  -- Assessment pass calculation/section policy is deliberately unavailable until D4/D6.
  if a.mode='practice' and (new.passed is not null or new.policy_hash is not null or new.policy_revision is not null) then raise exception 'Practice is not an assessment'; end if;
  if a.mode='assessment' then raise exception 'Assessment finalization is not enabled in D3'; end if;
  return new;
end $$;

create function private.v2_immutable_update() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Learning history is append-only; explicit reset/account deletion are the deletion paths' using errcode='55000'; end $$;
do $$ declare t text; s text; begin
  for s,t in select schemaname,tablename from pg_tables where
    (schemaname='public' and tablename like 'learning_v2_%') or
    (schemaname='private' and tablename in ('learning_v2_bindings','learning_v2_receipts','learning_v2_grade_audit','learning_navigation_events')) loop
    execute format('alter table %I.%I enable row level security',s,t);
    execute format('revoke all on %I.%I from public,anon,authenticated,linguatrack_registry_importer,linguatrack_registry_reviewer',s,t);
    if s='public' then
      execute format('grant select on %I.%I to authenticated',s,t);
      execute format('create policy owner_read on %I.%I for select to authenticated using (user_id=auth.uid())',s,t);
      execute format('create index on %I.%I (user_id,generation)',s,t);
    end if;
    if t<>'learning_navigation_events' then
      execute format('create trigger v2_owner_generation before insert or update on %I.%I for each row execute function private.v2_guard_record()',s,t);
    end if;
    if t not in ('learning_v2_resume','learning_v2_study_sessions') then
      execute format('create trigger immutable_update before update on %I.%I for each row execute function private.v2_immutable_update()',s,t);
    end if;
    execute format('create trigger immutable_truncate before truncate on %I.%I for each statement execute function private.v2_immutable_update()',s,t);
  end loop;
end $$;
create trigger v2_result_totals before insert on public.learning_v2_attempt_results for each row execute function private.v2_guard_result();
create index on private.learning_navigation_events(user_id,generation,event_id desc);
create index on public.learning_v2_attempts(user_id,created_at desc,id);
create index on public.learning_v2_responses(user_id,created_at desc,id);
create index on public.learning_v2_grades(response_id);
create index on public.learning_v2_attempt_results(attempt_id);
create index on public.learning_v2_review_events(mistake_id);
create function private.audit_learning_v2_grade() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.learning_v2_grade_audit(grade_id,response_id,user_id,generation,release_hash,principal)
    values(new.id,new.response_id,new.user_id,new.generation,new.release_hash,session_user);
  return new;
end $$;
create trigger grade_provenance after insert on public.learning_v2_grades for each row execute function private.audit_learning_v2_grade();

create function private.record_learning_navigation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='profiles' then
    if new.last_lesson_id is null then return new; end if;
    if tg_op='UPDATE' and (new.last_lesson_id,new.last_block_id,new.content_version) is not distinct from
      (old.last_lesson_id,old.last_block_id,old.content_version) then return new; end if;
    insert into private.learning_navigation_events(user_id,generation,schema_version,content_version,lesson_id,block_id,source,accepted_at)
      values(new.id,new.learning_generation,1,new.content_version,new.last_lesson_id,new.last_block_id,'v1_position_change',coalesce(new.updated_at,clock_timestamp()));
  else
    insert into private.learning_navigation_events(user_id,generation,schema_version,content_version,release_hash,lesson_id,lesson_revision,block_id,block_revision,step,exercise_id,exercise_revision,source,accepted_at)
      values(new.user_id,new.generation,2,(select content_version from curriculum_private.artifacts where package_hash=new.release_hash),new.release_hash,new.lesson_id,new.lesson_revision,new.block_id,new.block_revision,new.step,new.exercise_id,new.exercise_revision,'v2_navigation',new.accepted_at);
  end if;
  return new;
end $$;
-- A provenance-labelled baseline, not reconstructed navigation or copied attempts.
insert into private.learning_navigation_events(user_id,generation,schema_version,content_version,lesson_id,block_id,source,accepted_at)
  select id,learning_generation,1,content_version,last_lesson_id,last_block_id,'legacy_baseline',coalesce(updated_at,created_at)
  from public.profiles where last_lesson_id is not null;
create trigger v1_navigation after insert or update on public.profiles for each row execute function private.record_learning_navigation();
create trigger v2_navigation after insert or update on public.learning_v2_resume for each row execute function private.record_learning_navigation();

create function public.learning_history_v2() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); gen integer; data jsonb:='{}'; t text; rows jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select learning_generation into gen from public.profiles where id=uid for update;
  if not found then raise exception 'Learning profile unavailable'; end if;
  -- One locked owner snapshot: aggregation avoids PostgREST max_rows truncation.
  foreach t in array array['attempts','responses','grades','attempt_results','completion_events','mistakes','review_events','resume','study_sessions'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.learning_v2_%I r where user_id=$1 and generation=$2',t) into rows using uid,gen;
    data:=data||jsonb_build_object(t,rows);
  end loop;
  return jsonb_build_object('exportVersion',2,'complete',true,'exportedAt',clock_timestamp(),'userId',uid,'generation',gen,
    'legacy',public.learning_export(),'v2',data,'resume',
      (select to_jsonb(n)-'user_id'-'generation' from private.learning_navigation_events n where user_id=uid and generation=gen order by event_id desc limit 1));
end $$;

-- Preserve the existing signature, legacy response shape, receipt semantics and generation lock.
create or replace function public.reset_learning(p_request_id uuid,p_version text,p_generation integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); previous private.learning_resets;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Reset request ID required'; end if;
  perform 1 from public.profiles where id=uid for update;
  select * into previous from private.learning_resets where user_id=uid and request_id=p_request_id;
  if found then
    if previous.starting_generation is distinct from p_generation or previous.content_version is distinct from p_version then raise exception 'Reset request mismatch'; end if;
    return public.learning_snapshot(p_version);
  end if;
  perform private.guard_learning_generation(p_generation);
  if not exists(select 1 from private.lesson_catalog where content_version=p_version) and not exists
    (select 1 from curriculum_private.releases r join curriculum_private.artifacts a using(package_hash) where a.content_version=p_version) then raise exception 'Unknown content version'; end if;
  delete from public.learning_v2_completion_events where user_id=uid;
  delete from public.learning_v2_attempts where user_id=uid; -- cascading responses, decisions, reviews, receipts
  delete from public.learning_v2_resume where user_id=uid;
  delete from public.learning_v2_study_sessions where user_id=uid;
  delete from private.learning_navigation_events where user_id=uid;
  delete from public.mistake_reviews where user_id=uid;
  delete from public.exercise_responses where user_id=uid;
  delete from public.quiz_attempts where user_id=uid;
  delete from public.lesson_progress where user_id=uid;
  delete from public.study_sessions where user_id=uid;
  update public.profiles set last_lesson_id=null,last_block_id=null,content_version=null,
    updated_at=now(),learning_generation=learning_generation+1 where id=uid;
  insert into private.learning_resets(user_id,request_id,starting_generation,content_version) values(uid,p_request_id,p_generation,p_version);
  return public.learning_snapshot(p_version);
end $$;
revoke all on function public.learning_history_v2() from public,anon,authenticated;
grant execute on function public.learning_history_v2() to authenticated;
revoke all on function private.v2_member(text,text,text,integer),private.v2_edge(text,text,text,integer,text,text,integer),
  private.v2_guard_record(),private.v2_guard_result(),private.v2_immutable_update(),private.record_learning_navigation(),private.audit_learning_v2_grade()
  from public,anon,authenticated,linguatrack_registry_importer,linguatrack_registry_reviewer;
revoke all on private.learning_navigation_events_event_id_seq from public,anon,authenticated,linguatrack_registry_importer,linguatrack_registry_reviewer;
commit;
