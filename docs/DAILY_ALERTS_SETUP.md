# Daily Alerts Setup Guide

## Overview
The daily alerts system sends personalized inventory alerts to all users at 7 AM based on their roles and assigned branches.

## What Gets Sent

### Role-Based Alerts:

**All Users:**
- ⚠️ Items expiring within 30 days
- 🚨 Pending emergency assignments

**Managers & Admins** (system_admin, branch_system_admin, branch_manager, admin, regional_manager):
- 📦 Low stock alerts (< 10 units)
- 🤖 New AI recommendations
- 💰 High-value inventory items (for system admins & regional managers)

**Dispensers & Doctors:**
- 📋 Pending weekly tasks

## Setup Instructions

### Option 1: Using Supabase pg_cron (Pro/Team Plan)

1. **Run the migration:**
   ```bash
   supabase db push --project-ref pvtrcbemeesaebrwhenw
   ```

2. **Verify the cron job:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'daily_alerts_7am';
   ```

3. **Test manually:**
   ```bash
   curl -X POST https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

### Option 2: External Cron Service (Free Tier)

If you're on the free tier, use an external cron service:

#### GitHub Actions (Recommended)

Create `.github/workflows/daily-alerts.yml`:

```yaml
name: Daily Alerts

on:
  schedule:
    - cron: '0 7 * * *'  # 7 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  send-alerts:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Daily Alerts
        run: |
          curl -X POST https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

Add `SUPABASE_SERVICE_ROLE_KEY` to your GitHub repository secrets.

#### Render Cron Job

1. Go to Render Dashboard
2. Create a new Cron Job
3. Schedule: `0 7 * * *` (7 AM UTC daily)
4. Command:
   ```bash
   curl -X POST https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
5. Add `SUPABASE_SERVICE_ROLE_KEY` as an environment variable

#### Other Options
- **Vercel Cron Jobs** (if using Vercel)
- **EasyCron** (paid service)
- **cron-job.org** (free tier available)

## Timezone Configuration

The cron job is set to run at **7 AM UTC** by default. To change the timezone:

1. **Calculate UTC time:**
   - 7 AM EST (UTC-5) = 12 PM UTC
   - 7 AM PST (UTC-8) = 3 PM UTC
   - 7 AM GMT (UTC+0) = 7 AM UTC

2. **Update cron expression:**
   - For 7 AM EST: Change `'0 7 * * *'` to `'0 12 * * *'`
   - For 7 AM PST: Change `'0 7 * * *'` to `'0 15 * * *'`

## Testing

### Manual Test
```bash
curl -X POST https://pvtrcbemeesaebrwhenw.supabase.co/functions/v1/daily-alerts \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Expected Response
```json
{
  "success": true,
  "message": "Daily alerts processed",
  "users_processed": 10,
  "alerts_generated": 8,
  "alerts_sent": 8,
  "details": [...]
}
```

## Notification Methods

1. **WhatsApp** (if user has phone number):
   - Queued in `whatsapp_notifications` table
   - Sent by the scheduled `send-whatsapp` job

2. **In-App Notifications**:
   - Stored in `notifications` table
   - Visible in the app's notification center

## Monitoring

Check function logs:
```bash
supabase functions logs daily-alerts --project-ref pvtrcbemeesaebrwhenw
```

Or view in Supabase Dashboard:
https://supabase.com/dashboard/project/pvtrcbemeesaebrwhenw/functions/daily-alerts/logs

## Troubleshooting

### Alerts not being sent
1. Check function logs for errors
2. Verify users have active status
3. Check if users have assigned branches
4. Verify WhatsApp notifications are being processed

### Wrong timezone
- Update cron expression in migration or external cron service
- Recalculate UTC offset for your timezone

### Missing alerts for some users
- Check user roles are assigned
- Verify branch assignments
- Check if user has phone number for WhatsApp alerts

