# Automation & QA Checklist

This guide captures the operational steps that still need to be configured outside of version control to ship a production-ready build. Every command below is safe to run repeatedly and uses only documented Supabase/Twilio features.

---

## 1. Cron / Scheduler Jobs

Supabase projects that have the `pg_cron` extension enabled can schedule SQL/HTTP calls directly from the database. If you’re on the free tier, run the same curl commands from an external worker (GitHub Actions, Render, Fly.io, etc.).

### 1.1 Single script to create/refresh jobs

Paste the following into **SQL → New query** (replace `<PROJECT-REF>` with your project ref). It enables `pg_cron`, clears existing jobs with the same names, and recreates the four schedules.

```sql
-- Enable pg_cron if it isn’t already
create extension if not exists pg_cron;

-- Remove old jobs (idempotent)
select cron.unschedule('process_whatsapp_queue');
select cron.unschedule('expiry_warning_digest');
select cron.unschedule('generate_ai_recommendations');
select cron.unschedule('run_scheduled_exports');

-- WhatsApp queue: every 5 minutes
select cron.schedule(
  'process_whatsapp_queue',
  '*/5 * * * *',
  $$
    select
      http_post(
        'https://<PROJECT-REF>.supabase.co/functions/v1/send-whatsapp',
        json_build_object('process_pending', true)::jsonb,
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('supabase.anon_key')
        )
      );
  $$
);

-- Expiry digest: daily at 08:00
select cron.schedule(
  'expiry_warning_digest',
  '0 8 * * *',
  $$
    select
      http_post(
        'https://<PROJECT-REF>.supabase.co/functions/v1/send-whatsapp',
        json_build_object('process_pending', true)::jsonb,
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('supabase.anon_key')
        )
      );
  $$
);

-- AI recommendations: daily at 02:00 (swap in HTTP call if needed)
select cron.schedule(
  'generate_ai_recommendations',
  '0 2 * * *',
  $$
    select public.generate_ai_recommendations();
  $$
);

-- Scheduled exports: hourly
select cron.schedule(
  'run_scheduled_exports',
  '0 * * * *',
  $$
    select public.process_scheduled_exports();
  $$
);
```

If `generate_ai_recommendations()` or `process_scheduled_exports()` aren’t implemented yet, replace those bodies with the appropriate edge-function HTTP call using the same pattern as WhatsApp.

---

## 2. Twilio Webhook Configuration

1. Deploy edge functions (already done): `send-whatsapp`, `whatsapp-webhook`.
2. In the Twilio console, set:
   - **WhatsApp Sandbox / Phone Number → Incoming Message URL**  
     `https://$PROJECT_REF.supabase.co/functions/v1/send-whatsapp`
   - **Status Callback URL**  
     `https://$PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`
3. Store credentials in Supabase secrets:

```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxx
supabase secrets set TWILIO_WHATSAPP_NUMBER=+14155551234
```

4. Smoke test the flow:

```bash
curl -X POST "https://$PROJECT_REF.supabase.co/functions/v1/send-whatsapp" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{"process_pending": true}'
```

Confirm that rows move from `whatsapp_notification_queue` to `whatsapp_notifications` with updated statuses.

---

## 3. Manual QA Pass

Use this list when verifying a release:

- [ ] Upload stock with a template, confirm branch enforcement.
- [ ] Trigger WhatsApp queue (Emergency Manager, Expiry Manager) and watch history.
- [ ] Verify doctor users see only their branch data.
- [ ] Check branch settings/performance dashboards for doctor read-only access.
- [ ] Run AI recommendations UI and ensure doctor cannot modify entries.
- [ ] Confirm Twilio delivers real WhatsApp messages end-to-end.
- [ ] Execute the lint command and note remaining warnings for follow-up:

  ```bash
  npm run lint
  ```

- [ ] Execute the front-end build:

  ```bash
  npm run build
  ```

Document any failures in `docs/QA_RUNBOOK.md` (or create it if necessary).

---

## 4. Outstanding Lint Debt

The current lint run (`npm run lint`) still reports:

- React hook dependency warnings (e.g., missing dependencies in `useEffect`/`useCallback`).
- `@typescript-eslint/no-explicit-any` violations across legacy components.
- `prefer-const` warnings where variables can be immutable.
- Fast-refresh warnings for files exporting non-component utilities.

Fixing these requires coordinated refactors; plan to tackle them module-by-module and ensure functional tests run after each pass.

---

## 5. References

- `docs/backend.md` — canonical SQL definitions and migration notes.
- `docs/COMPLETE_FEATURE_ROADMAP_UPDATED.md` — product roadmap context.
- `docs/FEATURE_EMERGENCY_ASSIGNMENTS_SECURITY.md` — emergency assignments policies.
- Supabase cron docs: https://supabase.com/docs/guides/platform/pgcron
- Twilio WhatsApp docs: https://www.twilio.com/docs/whatsapp

