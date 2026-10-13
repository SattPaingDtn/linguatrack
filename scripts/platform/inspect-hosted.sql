-- Read-only inventory for the ONE existing project, after target identity verification.
-- Run under a reviewed operator/read-only session. No secrets, grading payloads or user rows.
begin read only;
select current_database() as database_name, current_user as inspecting_role,
  current_setting('server_version') as postgres_version;
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;
select nspname as schema_name from pg_namespace
  where nspname in ('public','auth','private','curriculum_private','supabase_migrations');
select n.nspname as schema_name,c.relname as relation,c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and n.nspname in ('public','private','curriculum_private')
  order by 1,2;
select schemaname,tablename,policyname,roles,cmd,
  position('auth.uid' in coalesce(qual,''))>0 as mentions_owner_check
  from pg_policies where schemaname in ('public','private','curriculum_private')
  order by 1,2,3;
select n.nspname as schema_name,p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef as security_definer,
  array(select setting from unnest(p.proconfig) setting
    where setting ~ '^(search_path|statement_timeout|row_security)=') as safe_function_settings,
  p.proacl as grants
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private','curriculum_private') order by 1,2;
select rolname,rolsuper,rolbypassrls,rolcanlogin,rolinherit
  from pg_roles where rolname in ('anon','authenticated','service_role') or rolname like 'linguatrack_%'
  order by rolname;
select role.rolname as granted_role,member.rolname as member
  from pg_auth_members m join pg_roles role on role.oid=m.roleid
  join pg_roles member on member.oid=m.member
  where role.rolname like 'linguatrack_%' or member.rolname like 'linguatrack_%';
select table_schema,table_name,column_name,data_type from information_schema.columns
  where table_schema in ('public','private','curriculum_private') order by 1,2,ordinal_position;
select extname,extversion from pg_extension order by extname;
select current_setting('pgrst.db_schemas',true) as exposed_schemas_if_visible;
rollback;
-- Only if the ledger EXISTS, separately inspect:
-- select version from supabase_migrations.schema_migrations order by version;
-- NULL exposed_schemas_if_visible is unknown, not proof that private schemas are excluded.
