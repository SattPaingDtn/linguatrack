-- D2: additive, inactive registry. Apply only to isolated/local databases in this phase.
begin;
create schema curriculum_private;
revoke all on schema curriculum_private from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'linguatrack_registry_importer') then
    create role linguatrack_registry_importer nologin noinherit;
  end if;
  if not exists(select 1 from pg_roles where rolname = 'linguatrack_registry_reviewer') then
    create role linguatrack_registry_reviewer nologin noinherit;
  end if;
  if exists(select 1 from pg_roles where rolname in ('linguatrack_registry_importer','linguatrack_registry_reviewer')
    and (rolsuper or rolbypassrls or rolcanlogin or rolinherit)) then
    raise exception 'Registry role configuration requires review';
  end if;
end $$;

create table curriculum_private.candidates (
  package_hash text primary key check(package_hash ~ '^[a-f0-9]{64}$'),
  content_version text not null unique,
  manifest jsonb not null check(manifest->>'state' = 'sealed'),
  registered_by name not null, registered_at timestamptz not null default now(),
  check(content_version = manifest->>'contentVersion')
);
-- Provisioning is an administrative decision, not an author-provided JSON field.
-- No reviewer or scope is granted by this migration.
create table curriculum_private.reviewer_scopes (
  principal name not null, scope text not null check(scope in ('translation','coverage','grading','compatibility')),
  primary key(principal,scope)
);
create table curriculum_private.review_events (
  event_id bigint generated always as identity primary key,
  request_id uuid not null, package_hash text not null references curriculum_private.candidates,
  principal name not null, scope text not null check(scope in ('translation','coverage','grading','compatibility')),
  decision text not null check(decision in ('approve','reject')), created_at timestamptz not null default now(),
  unique(principal,request_id)
);
create table curriculum_private.artifacts (
  package_hash text primary key check(package_hash ~ '^[a-f0-9]{64}$'),
  content_version text not null unique, manifest jsonb not null,
  hash_algorithm text not null check(hash_algorithm = 'sha256-canonical-file-inventory-v1'),
  payload jsonb not null,
  check(manifest->>'curriculumId' = 'linguatrack-academy'),
  check(content_version = manifest->>'contentVersion'),
  check(manifest->>'state' in ('draft','sealed'))
);
create table curriculum_private.identities (
  entity_id text primary key, kind text not null,
  unique(entity_id,kind)
);
create table curriculum_private.legacy_sources (
  content_version text primary key check(content_version = '1.0.0'),
  file_hash text not null check(file_hash = 'eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3')
);
create table curriculum_private.legacy_origins (
  content_version text not null references curriculum_private.legacy_sources,
  kind text not null, entity_id text not null, pointer text not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  primary key(content_version,kind,entity_id,pointer)
);
create table curriculum_private.artifact_files (
  package_hash text not null references curriculum_private.artifacts,
  path text not null, file_hash text not null check(file_hash ~ '^[a-f0-9]{64}$'),
  byte_length integer not null check(byte_length >= 0), contents bytea not null,
  primary key(package_hash,path),
  check(octet_length(contents) = byte_length),
  check(encode(sha256(contents),'hex') = file_hash)
);
create table curriculum_private.entities (
  kind text not null, entity_id text not null, revision integer not null check(revision > 0),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  visibility text not null check(visibility in ('public','private')),
  payload jsonb not null,
  primary key(kind,entity_id,revision),
  foreign key(entity_id,kind) references curriculum_private.identities(entity_id,kind),
  check(kind = payload->>'kind' and entity_id = payload->>'id' and revision = (payload->>'revision')::integer)
);
create table curriculum_private.artifact_entities (
  package_hash text not null references curriculum_private.artifacts,
  kind text not null, entity_id text not null, revision integer not null,
  primary key(package_hash,kind,entity_id,revision),
  foreign key(kind,entity_id,revision) references curriculum_private.entities
);
create table curriculum_private.entity_references (
  package_hash text not null, source_kind text not null, source_id text not null, source_revision integer not null,
  target_kind text not null, target_id text not null, target_revision integer not null,
  primary key(package_hash,source_kind,source_id,source_revision,target_kind,target_id,target_revision),
  foreign key(package_hash,source_kind,source_id,source_revision) references curriculum_private.artifact_entities,
  foreign key(target_kind,target_id,target_revision) references curriculum_private.entities deferrable initially deferred
);
create table curriculum_private.grading_bindings (
  kind text not null default 'exercise' check(kind = 'exercise'), entity_id text not null,
  revision integer not null, grading_revision integer not null check(grading_revision > 0),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'), payload jsonb not null,
  primary key(kind,entity_id,revision), foreign key(kind,entity_id,revision) references curriculum_private.entities
);
create table curriculum_private.policy_bindings (
  kind text not null default 'assessment' check(kind = 'assessment'), entity_id text not null,
  revision integer not null, policy_revision integer not null check(policy_revision > 0),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'), payload jsonb not null,
  primary key(kind,entity_id,revision), foreign key(kind,entity_id,revision) references curriculum_private.entities
);
create table curriculum_private.compatibility_mappings (
  package_hash text not null references curriculum_private.artifacts,
  mapping_hash text not null, source_identity jsonb not null, target_version text not null,
  target_kind text not null, target_id text not null, target_revision integer not null, payload jsonb not null,
  primary key(package_hash,mapping_hash), unique(package_hash,source_identity,target_version),
  foreign key(target_kind,target_id,target_revision) references curriculum_private.entities deferrable initially deferred
);
create table curriculum_private.releases (
  package_hash text primary key references curriculum_private.artifacts,
  imported_by name not null, imported_at timestamptz not null default now(),
  state text not null default 'inactive' check(state = 'inactive')
);
create table curriculum_private.import_events (
  package_hash text primary key references curriculum_private.releases,
  principal name not null, created_at timestamptz not null default now()
);
create table curriculum_private.channels (
  channel text primary key, enabled boolean not null default false check(not enabled),
  active_package_hash text check(active_package_hash is null), epoch bigint not null default 0 check(epoch = 0)
);
insert into curriculum_private.channels(channel) values('default');

create function curriculum_private.immutable_registry() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Curriculum registry records are immutable' using errcode = '55000'; end $$;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'curriculum_private' loop
    execute format('alter table curriculum_private.%I enable row level security', t);
    execute format('revoke all on curriculum_private.%I from public, anon, authenticated, linguatrack_registry_importer, linguatrack_registry_reviewer', t);
    if t <> 'reviewer_scopes' then
      execute format('create trigger immutable_row before update or delete on curriculum_private.%I for each row execute function curriculum_private.immutable_registry()', t);
      execute format('create trigger immutable_truncate before truncate on curriculum_private.%I for each statement execute function curriculum_private.immutable_registry()', t);
    end if;
  end loop;
end $$;

create function curriculum_private.require_importer() returns void language plpgsql set search_path = '' as $$
begin
  if not pg_catalog.pg_has_role(session_user,'linguatrack_registry_importer','member') then
    raise exception 'Registry importer authentication required' using errcode = '42501';
  end if;
end $$;
create function curriculum_private.register_candidate(p_hash text, p_manifest jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare previous curriculum_private.candidates;
begin
  perform curriculum_private.require_importer();
  if p_manifest->>'state' is distinct from 'sealed' then raise exception 'Sealed candidate required'; end if;
  if p_manifest->>'schemaVersion' is distinct from '2' or p_manifest->>'contractVersion' is distinct from '2.0.0' or
     p_manifest->>'curriculumId' is distinct from 'linguatrack-academy' or p_manifest->>'cefrAwarding' is distinct from 'disabled' then
    raise exception 'Unsupported registry contract'; end if;
  insert into curriculum_private.candidates(package_hash,content_version,manifest,registered_by)
    values(p_hash,p_manifest->>'contentVersion',p_manifest,session_user) on conflict do nothing;
  select * into previous from curriculum_private.candidates where content_version = p_manifest->>'contentVersion';
  if not found or previous.package_hash is distinct from p_hash or previous.manifest is distinct from p_manifest then
    raise exception 'Candidate version/hash conflict' using errcode = '23505';
  end if;
end $$;
create function curriculum_private.record_review(p_hash text,p_scope text,p_decision text,p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare previous curriculum_private.review_events;
begin
  if not pg_catalog.pg_has_role(session_user,'linguatrack_registry_reviewer','member') or
     pg_catalog.pg_has_role(session_user,'linguatrack_registry_importer','member') or
     not exists(select 1 from curriculum_private.reviewer_scopes where principal = session_user and scope = p_scope) then
    raise exception 'Assigned independent reviewer authentication required' using errcode = '42501';
  end if;
  insert into curriculum_private.review_events(request_id,package_hash,principal,scope,decision)
    values(p_request,p_hash,session_user,p_scope,p_decision) on conflict(principal,request_id) do nothing;
  select * into previous from curriculum_private.review_events where principal = session_user and request_id = p_request;
  if previous.package_hash is distinct from p_hash or previous.scope is distinct from p_scope or previous.decision is distinct from p_decision then
    raise exception 'Review request conflict' using errcode = '23505';
  end if;
  return jsonb_build_object('packageHash',previous.package_hash,'scope',previous.scope,'decision',previous.decision,'principal',previous.principal);
end $$;
create function curriculum_private.approval_status(p_hash text) returns jsonb
language sql security definer set search_path = '' as $$
with latest as (
  select distinct on(e.principal,e.scope) e.scope,e.decision,e.principal from curriculum_private.review_events e
  join curriculum_private.reviewer_scopes s using(principal,scope)
  where e.package_hash = p_hash and pg_catalog.pg_has_role(e.principal,'linguatrack_registry_reviewer','member')
    and not pg_catalog.pg_has_role(e.principal,'linguatrack_registry_importer','member')
  order by e.principal,e.scope,e.event_id desc
)
select jsonb_build_object('approved',
  not exists(select 1 from latest where decision = 'reject') and
  not exists(select 1 from unnest(array['translation','coverage','grading','compatibility']) required(scope)
    where not exists(select 1 from latest l where l.scope = required.scope and l.decision = 'approve')),
  'scopes',coalesce((select jsonb_agg(distinct scope order by scope) from latest where decision = 'approve'),'[]'::jsonb))
$$;
create function curriculum_private.registry_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform curriculum_private.require_importer();
  return jsonb_build_object(
    'releases',coalesce((select jsonb_agg(jsonb_build_object('curriculumId','linguatrack-academy','contentVersion',a.content_version,'hash',a.package_hash,
      'entityRefs',coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'id',e.entity_id,'revision',e.revision) order by e.kind,e.entity_id,e.revision)
        from curriculum_private.artifact_entities e where e.package_hash = a.package_hash),'[]'::jsonb)) order by a.content_version) from curriculum_private.artifacts a),'[]'::jsonb),
    'entities',coalesce((select jsonb_agg(jsonb_build_object('ref',jsonb_build_object('kind',kind,'id',entity_id,'revision',revision),'hash',payload_hash)) from curriculum_private.entities),'[]'::jsonb),
    'grading',coalesce((select jsonb_agg(jsonb_build_object('exerciseRef',jsonb_build_object('kind',kind,'id',entity_id,'revision',revision),'gradingRevision',grading_revision,'hash',payload_hash)) from curriculum_private.grading_bindings),'[]'::jsonb),
    'policies',coalesce((select jsonb_agg(jsonb_build_object('assessmentRef',jsonb_build_object('kind',kind,'id',entity_id,'revision',revision),'policyRevision',policy_revision,'hash',payload_hash)) from curriculum_private.policy_bindings),'[]'::jsonb)
  );
end $$;

create function curriculum_private.stage_release(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a jsonb; e jsonb; r jsonb; b jsonb; m jsonb; f jsonb; existing jsonb;
  h text := p_plan->>'candidateHash'; candidate curriculum_private.candidates;
begin
  perform curriculum_private.require_importer();
  perform pg_catalog.pg_advisory_xact_lock(312,2); -- Serialize version/entity decisions, not learner writes.
  select * into candidate from curriculum_private.candidates where package_hash = h;
  if not found then raise exception 'Registered sealed candidate required'; end if;
  if exists(select 1 from jsonb_array_elements_text(candidate.manifest->'requiredCapabilities') c
    where c not in ('legacy-v1-bridge','multiple_choice','package-media')) then raise exception 'Unsupported staging capability'; end if;
  if (curriculum_private.approval_status(h)->>'approved')::boolean is distinct from true then
    raise exception 'Authenticated candidate reviews required' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_plan->'artifacts'),'null') <> 'array' or jsonb_array_length(p_plan->'artifacts') = 0 or
    (p_plan->'artifacts'->-1->>'hash') is distinct from h or
    (p_plan->'artifacts'->-1->'manifest') is distinct from candidate.manifest then raise exception 'Candidate plan mismatch'; end if;
  if p_plan->>'legacySourceHash' is distinct from 'eaa0c7d83de059f425a995b2a87dfb5001b68596f3d8ac72cdf9864dafad95c3' then raise exception 'Legacy source hash mismatch'; end if;
  insert into curriculum_private.legacy_sources values('1.0.0',p_plan->>'legacySourceHash') on conflict do nothing;
  for e in select value from jsonb_array_elements(p_plan->'legacyOrigins') loop
    insert into curriculum_private.legacy_origins values('1.0.0',e->>'kind',e->>'id',e->>'pointer',e->>'hash') on conflict do nothing;
    if not exists(select 1 from curriculum_private.legacy_origins where content_version='1.0.0' and kind=e->>'kind' and entity_id=e->>'id'
      and pointer=e->>'pointer' and payload_hash=e->>'hash') then raise exception 'Immutable legacy origin conflict'; end if;
  end loop;
  for a in select value from jsonb_array_elements(p_plan->'artifacts') loop
    if a->>'hash' = h and a->'manifest'->>'state' <> 'sealed' then raise exception 'Sealed candidate required'; end if;
    insert into curriculum_private.artifacts(package_hash,content_version,manifest,hash_algorithm,payload)
      values(a->>'hash',a->'manifest'->>'contentVersion',a->'manifest','sha256-canonical-file-inventory-v1',a) on conflict do nothing;
    select payload into existing from curriculum_private.artifacts where content_version = a->'manifest'->>'contentVersion';
    if existing is distinct from a then raise exception 'Release version/hash or payload conflict' using errcode = '23505'; end if;
    if a->'manifest'->'basedOn'->>'schemaVersion' = '2' and not exists(select 1 from curriculum_private.artifacts
      where content_version = a->'manifest'->'basedOn'->>'contentVersion' and package_hash = a->'manifest'->'basedOn'->>'sha256') then
      raise exception 'Exact parent artifact required' using errcode='23503'; end if;
    for f in select value from jsonb_array_elements(a->'files') loop
      insert into curriculum_private.artifact_files values(a->>'hash',f->>'path',f->>'sha256',(f->>'byteLength')::integer,decode(f->>'base64','base64')) on conflict do nothing;
    end loop;
    if not exists(select 1 from curriculum_private.artifact_files where package_hash=a->>'hash' and path='manifest.json'
      and convert_from(contents,'UTF8')::jsonb=a->'manifest') or
      (select encode(sha256(convert_to(E'[\n' || string_agg(format(E'  {\n    "path": %s,\n    "sha256": %s\n  }',to_jsonb(path)::text,to_jsonb(file_hash)::text),E',\n' order by path collate "C") || E'\n]\n','UTF8')),'hex')
        from curriculum_private.artifact_files where package_hash=a->>'hash') is distinct from a->>'hash' then
      raise exception 'Exact file-package identity required'; end if;
    for e in select value from jsonb_array_elements(a->'entities') loop
      if not exists(select 1 from curriculum_private.entities where kind=e->'payload'->>'kind' and entity_id=e->'payload'->>'id'
        and revision=(e->'payload'->>'revision')::integer) and exists(select 1 from curriculum_private.entities
        where entity_id=e->'payload'->>'id' and revision >= (e->'payload'->>'revision')::integer) then raise exception 'Entity revision must increase'; end if;
      insert into curriculum_private.identities(entity_id,kind) values(e->'payload'->>'id',e->'payload'->>'kind') on conflict do nothing;
      insert into curriculum_private.entities(kind,entity_id,revision,payload_hash,visibility,payload)
        values(e->'payload'->>'kind',e->'payload'->>'id',(e->'payload'->>'revision')::integer,e->>'hash',e->>'visibility',e->'payload') on conflict do nothing;
      if not exists(select 1 from curriculum_private.entities where kind = e->'payload'->>'kind' and entity_id = e->'payload'->>'id'
        and revision = (e->'payload'->>'revision')::integer and payload_hash = e->>'hash' and payload = e->'payload' and visibility = e->>'visibility') then
        raise exception 'Immutable entity revision conflict' using errcode = '23505';
      end if;
      insert into curriculum_private.artifact_entities values(a->>'hash',e->'payload'->>'kind',e->'payload'->>'id',(e->'payload'->>'revision')::integer) on conflict do nothing;
      for r in select value from jsonb_array_elements(e->'refs') loop
        insert into curriculum_private.entity_references values(a->>'hash',e->'payload'->>'kind',e->'payload'->>'id',(e->'payload'->>'revision')::integer,
          r->>'kind',r->>'id',(r->>'revision')::integer) on conflict do nothing;
      end loop;
    end loop;
    for b in select value from jsonb_array_elements(a->'grading') loop
      if not exists(select 1 from curriculum_private.grading_bindings where entity_id=b->'payload'->'exerciseRef'->>'id'
        and revision=(b->'payload'->'exerciseRef'->>'revision')::integer) and exists(select 1 from curriculum_private.grading_bindings
        where entity_id=b->'payload'->'exerciseRef'->>'id' and grading_revision >= (b->'payload'->>'gradingRevision')::integer) then raise exception 'Grading revision must increase'; end if;
      insert into curriculum_private.grading_bindings(kind,entity_id,revision,grading_revision,payload_hash,payload)
        values('exercise',b->'payload'->'exerciseRef'->>'id',(b->'payload'->'exerciseRef'->>'revision')::integer,
          (b->'payload'->>'gradingRevision')::integer,b->>'hash',b->'payload') on conflict do nothing;
      if not exists(select 1 from curriculum_private.grading_bindings where entity_id = b->'payload'->'exerciseRef'->>'id'
        and revision = (b->'payload'->'exerciseRef'->>'revision')::integer and payload_hash = b->>'hash' and payload = b->'payload') then
        raise exception 'Immutable grading binding conflict' using errcode = '23505'; end if;
    end loop;
    for b in select value from jsonb_array_elements(a->'policies') loop
      if not exists(select 1 from curriculum_private.policy_bindings where entity_id=b->'payload'->'assessmentRef'->>'id'
        and revision=(b->'payload'->'assessmentRef'->>'revision')::integer) and exists(select 1 from curriculum_private.policy_bindings
        where entity_id=b->'payload'->'assessmentRef'->>'id' and policy_revision >= (b->'payload'->>'policyRevision')::integer) then raise exception 'Policy revision must increase'; end if;
      insert into curriculum_private.policy_bindings(kind,entity_id,revision,policy_revision,payload_hash,payload)
        values('assessment',b->'payload'->'assessmentRef'->>'id',(b->'payload'->'assessmentRef'->>'revision')::integer,
          (b->'payload'->>'policyRevision')::integer,b->>'hash',b->'payload') on conflict do nothing;
      if not exists(select 1 from curriculum_private.policy_bindings where entity_id = b->'payload'->'assessmentRef'->>'id'
        and revision = (b->'payload'->'assessmentRef'->>'revision')::integer and payload_hash = b->>'hash' and payload = b->'payload') then
        raise exception 'Immutable assessment policy conflict' using errcode = '23505'; end if;
    end loop;
    for m in select value from jsonb_array_elements(a->'mappings') loop
      if not exists(select 1 from curriculum_private.artifact_entities e join curriculum_private.artifacts a2 using(package_hash)
        join curriculum_private.entities e2 using(kind,entity_id,revision)
        where a2.content_version=m->'payload'->'to'->>'contentVersion' and e.kind=m->'payload'->'to'->'ref'->>'kind'
          and e.entity_id=m->'payload'->'to'->'ref'->>'id' and e.revision=(m->'payload'->'to'->'ref'->>'revision')::integer
          and e2.payload_hash=m->'payload'->'fingerprints'->>'target') then raise exception 'Exact compatibility target required' using errcode='23503'; end if;
      if m->'payload'->'from'->>'schemaVersion'='1' then
        if not exists(select 1 from curriculum_private.legacy_origins where content_version=m->'payload'->'from'->>'contentVersion'
          and kind=m->'payload'->'from'->>'kind' and entity_id=m->'payload'->'from'->>'id'
          and pointer=coalesce(m->'payload'->'from'->>'pointer','') and payload_hash=m->'payload'->'fingerprints'->>'source') then
          raise exception 'Exact compatibility source required' using errcode='23503'; end if;
      elsif not exists(select 1 from curriculum_private.artifact_entities e join curriculum_private.artifacts a2 using(package_hash)
        join curriculum_private.entities e2 using(kind,entity_id,revision)
        where a2.content_version=m->'payload'->'from'->>'contentVersion' and e.kind=m->'payload'->'from'->'ref'->>'kind'
          and e.entity_id=m->'payload'->'from'->'ref'->>'id' and e.revision=(m->'payload'->'from'->'ref'->>'revision')::integer
          and e2.payload_hash=m->'payload'->'fingerprints'->>'source') then raise exception 'Exact compatibility source required' using errcode='23503'; end if;
      insert into curriculum_private.compatibility_mappings values(a->>'hash',m->>'hash',m->'payload'->'from',m->'payload'->'to'->>'contentVersion',
        m->'payload'->'to'->'ref'->>'kind',m->'payload'->'to'->'ref'->>'id',(m->'payload'->'to'->'ref'->>'revision')::integer,m->'payload') on conflict do nothing;
    end loop;
  end loop;
  insert into curriculum_private.releases(package_hash,imported_by) values(h,session_user) on conflict do nothing;
  insert into curriculum_private.import_events(package_hash,principal) values(h,session_user) on conflict do nothing;
  return jsonb_build_object('packageHash',h,'state','inactive','activated',false);
end $$;

revoke all on all functions in schema curriculum_private from public, anon, authenticated, linguatrack_registry_importer, linguatrack_registry_reviewer;
revoke all on all sequences in schema curriculum_private from public, anon, authenticated, linguatrack_registry_importer, linguatrack_registry_reviewer;
grant usage on schema curriculum_private to linguatrack_registry_importer, linguatrack_registry_reviewer;
grant execute on function curriculum_private.register_candidate(text,jsonb), curriculum_private.registry_snapshot(),
  curriculum_private.stage_release(jsonb), curriculum_private.approval_status(text) to linguatrack_registry_importer;
grant execute on function curriculum_private.record_review(text,text,text,uuid) to linguatrack_registry_reviewer;
commit;
