-- D4 preparation ONLY: local/isolated tests. Requires separate authorization before hosted use.
-- No environment, cohort, approval, release or channel is enabled by this migration.
begin;
do $$ begin
  if to_regprocedure('public.learning_history_v2()') is null or to_regclass('private.learning_v2_receipts') is null then
    raise exception 'Inspect/verify D3 prerequisites before D4';
  end if;
  if not exists(select 1 from pg_roles where rolname='linguatrack_staging_writer') then
    create role linguatrack_staging_writer nologin noinherit;
  end if;
  if exists(select 1 from pg_roles where rolname='linguatrack_staging_writer' and (rolsuper or rolbypassrls or rolcanlogin or rolinherit)) then
    raise exception 'Staging writer role configuration requires review';
  end if;
end $$;
create table private.learning_staging_environment (
  singleton boolean primary key default true check(singleton),
  environment text not null check(environment='staging'),
  project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$'),
  enabled boolean not null default false,
  provisioned_by name not null default session_user, provisioned_at timestamptz not null default now()
);
create table private.learning_staging_permissions (
  release_hash text not null references curriculum_private.releases(package_hash),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null, lesson_revision integer not null check(lesson_revision>0),
  delivery_id text not null, delivery_revision integer not null check(delivery_revision>0),
  allow_new boolean not null default false, allow_finish boolean not null default false,
  primary key(release_hash,user_id,lesson_id,lesson_revision,delivery_id,delivery_revision)
);
create table private.learning_v2_mcq_receipts (
  response_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null, release_hash text not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  submission jsonb not null, acknowledgement jsonb not null,
  foreign key(response_id,user_id,generation,release_hash)
    references public.learning_v2_responses(id,user_id,generation,release_hash) on delete cascade
);
alter table private.learning_staging_environment enable row level security;
alter table private.learning_staging_permissions enable row level security;
alter table private.learning_v2_mcq_receipts enable row level security;
revoke all on private.learning_staging_environment,private.learning_staging_permissions,private.learning_v2_mcq_receipts
  from public,anon,authenticated,linguatrack_staging_writer,linguatrack_registry_importer,linguatrack_registry_reviewer;
create trigger immutable_receipt_update before update on private.learning_v2_mcq_receipts for each row execute function private.v2_immutable_update();
create trigger immutable_receipt_truncate before truncate on private.learning_v2_mcq_receipts for each statement execute function private.v2_immutable_update();

create function private.require_staging_writer(p_project text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not pg_catalog.pg_has_role(session_user,'linguatrack_staging_writer','member')
    or pg_catalog.pg_has_role(session_user,'linguatrack_registry_importer','member')
    or pg_catalog.pg_has_role(session_user,'linguatrack_registry_reviewer','member') then
    raise exception 'Restricted staging writer authentication required' using errcode='42501';
  end if;
  if not exists(select 1 from private.learning_staging_environment where singleton and environment='staging' and enabled and project_ref=p_project) then
    raise exception 'Verified enabled staging environment required' using errcode='42501';
  end if;
end $$;

-- Private context never returned to a browser. Owner originates from verified server auth.
create function private.staging_mcq_context(p_project text,p_owner uuid,p_input jsonb,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare gen integer; existing private.learning_v2_mcq_receipts; attempt public.learning_v2_attempts;
  permission private.learning_staging_permissions; manifest jsonb; block jsonb; question jsonb;
  rule curriculum_private.grading_bindings; r jsonb;
begin
  perform private.require_staging_writer(p_project);
  if jsonb_typeof(p_input) is distinct from 'object' or p_input-array['schemaVersion','releaseHash','contentVersion','attemptId','responseId','generation','lesson','delivery','exercise','response']<>'{}'::jsonb
    or (select count(*) from jsonb_object_keys(p_input))<>10 or p_input->>'schemaVersion' is distinct from '2'
    or p_input#>>'{lesson,kind}' is distinct from 'lesson' or p_input#>>'{delivery,kind}' is distinct from 'block'
    or p_input#>>'{exercise,kind}' is distinct from 'exercise' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid pinned MCQ submission' using errcode='22023';
  end if;
  select learning_generation into gen from public.profiles where id=p_owner for update;
  if not found then raise exception 'Verified learner profile required' using errcode='42501'; end if;
  if gen is distinct from (p_input->>'generation')::integer then raise exception 'Stale learning generation' using errcode='40001'; end if;
  -- Check owner and generation before any receipt replay; no post-reset resurrection.
  select * into existing from private.learning_v2_mcq_receipts where response_id=(p_input->>'responseId')::uuid;
  if found then
    if existing.user_id is distinct from p_owner then raise exception 'Response unavailable' using errcode='42501'; end if;
    if existing.request_hash is distinct from p_hash or existing.submission is distinct from p_input then
      raise exception 'Response UUID payload conflict' using errcode='23505';
    end if;
    return jsonb_build_object('receipt',existing.acknowledgement); -- already committed; do not regrade
  end if;
  if exists(select 1 from public.learning_v2_responses where id=(p_input->>'responseId')::uuid) then
    raise exception 'Response UUID unavailable' using errcode='23505';
  end if;
  select * into attempt from public.learning_v2_attempts where id=(p_input->>'attemptId')::uuid;
  if found and (attempt.user_id is distinct from p_owner or attempt.generation<>gen or attempt.release_hash is distinct from p_input->>'releaseHash'
    or attempt.content_version is distinct from p_input->>'contentVersion' or attempt.lesson_id is distinct from p_input#>>'{lesson,id}'
    or attempt.lesson_revision is distinct from (p_input#>>'{lesson,revision}')::integer or attempt.delivery_kind<>'block'
    or attempt.delivery_id is distinct from p_input#>>'{delivery,id}' or attempt.delivery_revision is distinct from (p_input#>>'{delivery,revision}')::integer
    or attempt.mode<>'practice') then raise exception 'Pinned attempt unavailable' using errcode='42501'; end if;
  select * into permission from private.learning_staging_permissions where release_hash=p_input->>'releaseHash' and user_id=p_owner
    and lesson_id=p_input#>>'{lesson,id}' and lesson_revision=(p_input#>>'{lesson,revision}')::integer
    and delivery_id=p_input#>>'{delivery,id}' and delivery_revision=(p_input#>>'{delivery,revision}')::integer for share;
  if not found or (attempt.id is null and not permission.allow_new) or (attempt.id is not null and not permission.allow_finish) then
    raise exception 'Staging cohort/delivery permission required' using errcode='42501';
  end if;
  select a.manifest into manifest from curriculum_private.releases r join curriculum_private.artifacts a using(package_hash)
    where r.package_hash=permission.release_hash and r.state='inactive' and a.content_version=p_input->>'contentVersion';
  if manifest is null or manifest->>'state' is distinct from 'sealed'
    or (curriculum_private.approval_status(permission.release_hash)->>'approved')::boolean is distinct from true
    or jsonb_array_length(manifest->'legacyLocaleExceptions')<>0
    or exists(select 1 from curriculum_private.compatibility_mappings m where m.package_hash=permission.release_hash
      and m.target_version=manifest->>'contentVersion' and m.payload->>'reviewStatus' is distinct from 'approved') then
    raise exception 'Sealed hash-bound reviews and candidate compatibility approval required' using errcode='42501';
  end if;
  if not private.v2_member(permission.release_hash,'lesson',permission.lesson_id,permission.lesson_revision)
    or not private.v2_edge(permission.release_hash,'lesson',permission.lesson_id,permission.lesson_revision,'block',permission.delivery_id,permission.delivery_revision) then
    raise exception 'Invalid exact lesson delivery' using errcode='22023';
  end if;
  select payload into block from curriculum_private.entities where kind='block' and entity_id=permission.delivery_id and revision=permission.delivery_revision;
  if block->>'type' not in ('exercise_set','quiz') or block ? 'assessmentRef' then raise exception 'Only MCQ practice delivery is enabled' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(block->'exerciseRefs') loop
    if not exists(select 1 from curriculum_private.entities e where e.kind='exercise' and e.entity_id=r->>'id'
      and e.revision=(r->>'revision')::integer and e.payload->>'type'='multiple_choice') then
      raise exception 'Unsupported delivery capability' using errcode='22023';
    end if;
  end loop;
  if not block->'exerciseRefs' @> jsonb_build_array(p_input->'exercise') then raise exception 'Exercise is not in pinned delivery' using errcode='22023'; end if;
  if attempt.id is not null and exists(select 1 from public.learning_v2_attempt_results where attempt_id=attempt.id) then
    raise exception 'Finalized attempt requires a new attempt UUID' using errcode='23505';
  end if;
  if exists(select 1 from public.learning_v2_responses where attempt_id=(p_input->>'attemptId')::uuid and exercise_id=p_input#>>'{exercise,id}' and exercise_revision=(p_input#>>'{exercise,revision}')::integer) then
    raise exception 'Checked exercise requires a new attempt UUID' using errcode='23505';
  end if;
  select payload into question from curriculum_private.entities where kind='exercise' and entity_id=p_input#>>'{exercise,id}' and revision=(p_input#>>'{exercise,revision}')::integer;
  select * into rule from curriculum_private.grading_bindings where kind='exercise' and entity_id=p_input#>>'{exercise,id}' and revision=(p_input#>>'{exercise,revision}')::integer;
  if rule.payload is null or rule.payload->>'type'<>'multiple_choice' or rule.payload->>'scoring'<>'exact_set'
    or rule.payload->>'graderVersion'<>'multiple-choice-exact-set-v1' then raise exception 'Pinned grader capability unavailable' using errcode='22023'; end if;
  if (select count(*) from public.learning_v2_attempts where user_id=p_owner and created_at>now()-interval '1 hour')>=100 and attempt.id is null then
    raise exception 'Too many attempts; retry later' using errcode='54000';
  end if;
  return jsonb_build_object('question',question,'rule',rule.payload,'bindingHash',rule.payload_hash,'requiredExercises',block->'exerciseRefs');
end $$;

-- No client can execute this or supply a grade. The Node adapter computes the exact-set grade;
-- this boundary independently verifies it against immutable private rules inside the transaction.
create function private.commit_staging_mcq(p_project text,p_owner uuid,p_input jsonb,p_hash text,p_grade jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; question jsonb; rule jsonb; correct boolean; points integer; expected jsonb;
  response public.learning_v2_responses; grade_id uuid:=gen_random_uuid(); result_id uuid:=gen_random_uuid();
  acknowledgement jsonb; selected jsonb; correct_answer text;
  num integer; maximum integer; sum_points integer; num_correct integer;
begin
  context:=private.staging_mcq_context(p_project,p_owner,p_input,p_hash);
  if context ? 'receipt' then return context->'receipt'; end if;
  question:=context->'question'; rule:=context->'rule'; selected:=p_input#>'{response,optionIds}';
  if p_input#>>'{response,type}' is distinct from 'multiple_choice' or (p_input->'response')-array['type','optionIds']<>'{}'::jsonb
    or jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected) not between 1 and 12
    or (select count(distinct value) from jsonb_array_elements(selected))<>jsonb_array_length(selected)
    or (question->>'selection'='single' and jsonb_array_length(selected)<>1)
    or exists(select 1 from jsonb_array_elements(selected) s where not exists(select 1 from jsonb_array_elements(question->'options') o where o->'id'=s)) then
    raise exception 'Invalid selected options' using errcode='22023';
  end if;
  correct:=selected @> (rule->'correctOptionIds') and (rule->'correctOptionIds') @> selected;
  points:=case when correct then (rule->>'maxPoints')::integer else 0 end;
  select string_agg(o#>>'{text,text}','; ' order by ord) into correct_answer from jsonb_array_elements(question->'options') with ordinality x(o,ord)
    where rule->'correctOptionIds' @> jsonb_build_array(o->>'id');
  expected:=jsonb_build_object('points',points,'maxPoints',(rule->>'maxPoints')::integer,'isCorrect',correct,'explanation',rule->'explanation','correctAnswer',correct_answer);
  if p_grade is distinct from expected then raise exception 'Server grade does not match immutable binding' using errcode='22023'; end if;
  insert into public.learning_v2_attempts(id,user_id,generation,release_hash,content_version,lesson_id,lesson_revision,delivery_kind,delivery_id,delivery_revision,mode,required_exercises,runtime_version)
    values((p_input->>'attemptId')::uuid,p_owner,(p_input->>'generation')::integer,p_input->>'releaseHash',p_input->>'contentVersion',p_input#>>'{lesson,id}',(p_input#>>'{lesson,revision}')::integer,
      'block',p_input#>>'{delivery,id}',(p_input#>>'{delivery,revision}')::integer,'practice',context->'requiredExercises','multiple-choice-exact-set-v1') on conflict(id) do nothing;
  insert into public.learning_v2_responses(id,user_id,generation,release_hash,attempt_id,exercise_id,exercise_revision,request_hash,response,prompt_snapshot,options_snapshot)
    values((p_input->>'responseId')::uuid,p_owner,(p_input->>'generation')::integer,p_input->>'releaseHash',(p_input->>'attemptId')::uuid,p_input#>>'{exercise,id}',(p_input#>>'{exercise,revision}')::integer,
      p_hash,p_input->'response',question#>>'{prompt,text}',(select jsonb_agg(jsonb_build_object('id',o->>'id','text',o#>>'{text,text}')) from jsonb_array_elements(question->'options') o)) returning * into response;
  insert into private.learning_v2_bindings(response_id,user_id,generation,release_hash,exercise_id,exercise_revision,grading_hash)
    values(response.id,p_owner,response.generation,response.release_hash,response.exercise_id,response.exercise_revision,context->>'bindingHash');
  insert into public.learning_v2_grades(id,user_id,generation,release_hash,response_id,status,source,points,max_points,is_correct,feedback)
    values(grade_id,p_owner,response.generation,response.release_hash,response.id,'graded','automatic',points,(rule->>'maxPoints')::integer,correct,
      (rule->'explanation')||jsonb_build_object('correctAnswer',correct_answer));
  if not correct then insert into public.learning_v2_mistakes(id,user_id,generation,release_hash,response_id,grade_id)
    values(gen_random_uuid(),p_owner,response.generation,response.release_hash,response.id,grade_id); end if;
  select count(*),sum(g.max_points),sum(g.points),count(*) filter(where g.is_correct) into num,maximum,sum_points,num_correct
    from public.learning_v2_responses r join public.learning_v2_grades g on g.response_id=r.id where r.attempt_id=response.attempt_id;
  if num=jsonb_array_length(context->'requiredExercises') then
    insert into public.learning_v2_attempt_results(id,user_id,generation,release_hash,attempt_id,points,max_points,correct,total,percentage,runtime_version)
      values(result_id,p_owner,response.generation,response.release_hash,response.attempt_id,sum_points,maximum,num_correct,num,round(sum_points::numeric*100/maximum)::integer,'multiple-choice-exact-set-v1');
  else result_id:=null; end if;
  insert into private.learning_v2_receipts(response_id,user_id,generation,release_hash,request_hash) values(response.id,p_owner,response.generation,response.release_hash,p_hash);
  acknowledgement:=jsonb_build_object('mode','persistent','saved',true,'ownerId',p_owner,'projectRef',p_project,'requestHash',p_hash,'submission',p_input,
    'responseId',response.id,'gradeId',grade_id,'resultId',result_id,'feedback',expected,'receivedAt',response.created_at);
  insert into private.learning_v2_mcq_receipts(response_id,user_id,generation,release_hash,request_hash,submission,acknowledgement)
    values(response.id,p_owner,response.generation,response.release_hash,p_hash,p_input,acknowledgement);
  return acknowledgement;
end $$;
revoke all on function private.require_staging_writer(text),private.staging_mcq_context(text,uuid,jsonb,text),private.commit_staging_mcq(text,uuid,jsonb,text,jsonb)
  from public,anon,authenticated,linguatrack_registry_importer,linguatrack_registry_reviewer;
grant usage on schema private to linguatrack_staging_writer;
grant execute on function private.staging_mcq_context(text,uuid,jsonb,text),private.commit_staging_mcq(text,uuid,jsonb,text,jsonb) to linguatrack_staging_writer;
commit;
