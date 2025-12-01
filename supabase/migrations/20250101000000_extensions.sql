-- Migration: Extensions and Prerequisites
-- Description: Enable PostgreSQL extensions for UUID generation, HTTP requests, scheduled tasks, and secret storage

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pg_net for http_post() if you plan to call webhooks from the database
-- Note: pg_net may not be available in all Supabase instances
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net extension not available, skipping';
END $$;

-- Enable pg_cron for scheduled jobs (used to automate AI notifications)
-- Note: pg_cron may not be available in all Supabase instances
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available, skipping';
END $$;

-- Note: vault extension is not available in standard Supabase
-- Use Supabase's built-in secret management instead (via Dashboard or API)
-- CREATE EXTENSION IF NOT EXISTS vault; -- Commented out as not available

