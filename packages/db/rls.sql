-- Row-Level Security: the second lock behind every tenant-scoped query.
--
-- RLS does NOT apply to superusers or table owners. The local `app` role (created by
-- the Postgres image) owns the tables and is a superuser, so it is used ONLY by the
-- RLS-bypassing adminDb (migrations/seed). Tenant traffic runs as the non-superuser,
-- non-owner role `app_rls` (withTenant SET LOCAL ROLE app_rls), to which policies DO apply.
--
-- This file is idempotent and re-applied on every migrate run so policy changes propagate.

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls NOLOGIN;
  END IF;
END
$do$;

GRANT USAGE ON SCHEMA public TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls;

-- Enable + force RLS and (re)create the tenant policy on every tenant-scoped table.
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','bots','rules','sources','documents','chunks','conversations','messages'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$do$;
