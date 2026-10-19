-- CampusPilot AI — Database Role Initialization
-- Creates non-owner, non-superuser application connection role

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'campuspilot_app') THEN
    CREATE ROLE campuspilot_app WITH LOGIN PASSWORD 'app_secure_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE campuspilot TO campuspilot_app;
\c campuspilot;

GRANT USAGE ON SCHEMA public TO campuspilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campuspilot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campuspilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campuspilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO campuspilot_app;
