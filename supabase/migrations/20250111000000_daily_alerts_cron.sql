-- ============================================================================
-- Daily Alerts Cron Job Setup
-- Migration: 20250111000000_daily_alerts_cron.sql
-- Description: Sets up cron job to send daily alerts at 7 AM
-- ============================================================================

-- Add 'daily_alert' to WhatsApp notification message types if not exists
DO $$
BEGIN
  -- Check if daily_alert is in the check constraint
  -- If not, we'll need to alter the constraint (handled separately if needed)
  -- For now, we'll just ensure the function can use it
  NULL;
END $$;

-- Enable pg_cron extension if available (requires Supabase Pro/Team)
-- For free tier, use external cron service (GitHub Actions, etc.)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available. Use external cron service for free tier.';
END $$;

-- Remove existing job if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('daily_alerts_7am');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule daily alerts at 7 AM UTC
-- Note: Adjust timezone as needed. 7 AM UTC = different local times
-- For 7 AM local time, adjust the cron expression
-- Example: '0 7 * * *' = 7 AM UTC daily
-- To run at 7 AM in a specific timezone, calculate UTC offset
-- Example: 7 AM EST (UTC-5) = 12 PM UTC, so use '0 12 * * *'

-- Try to schedule using pg_net if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'daily_alerts_7am',
      '0 7 * * *', -- 7 AM UTC daily
      $cron$
      SELECT
        net.http_post(
          url := 'https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
          ),
          body := '{}'::jsonb
        ) AS request_id;
      $cron$
    );
    RAISE NOTICE 'Daily alerts cron job scheduled successfully using pg_net';
  ELSE
    RAISE NOTICE 'pg_net not available. Please set up external cron service (see instructions in migration file).';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule cron job: %. Set up external cron service instead.', SQLERRM;
END $$;

-- Instructions for external cron setup (if pg_cron/pg_net not available):
-- 1. Use GitHub Actions, Render Cron, or similar service
-- 2. Schedule a job to run daily at 7 AM (your timezone)
-- 3. Make a POST request to: https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts
-- 4. Include header: Authorization: Bearer YOUR_SERVICE_ROLE_KEY
-- 5. Example curl command:
--    curl -X POST https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts \
--      -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
--      -H "Content-Type: application/json" \
--      -d '{}'

