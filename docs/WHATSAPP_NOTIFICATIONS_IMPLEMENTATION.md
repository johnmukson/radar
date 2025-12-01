# WhatsApp Notifications Implementation Guide

**Date:** January 2025  
**Status:** ✅ **COMPLETE**  
**Priority:** High

---

## 📋 OVERVIEW

Complete WhatsApp notification system using Twilio WhatsApp API for emergency assignments, expiry warnings, deadline reminders, and system alerts. This replaces the SMS notification system with a more modern and feature-rich WhatsApp solution.

---

## ✅ IMPLEMENTATION COMPLETE

### **What Was Implemented:**

#### **1. Database Infrastructure**
- ✅ `whatsapp_notifications` table with full schema
- ✅ `whatsapp_notification_preferences` table for user preferences
- ✅ `branch_whatsapp_settings` table for branch-specific settings
- ✅ Comprehensive RLS policies for all roles
- ✅ Indexes for optimal performance
- ✅ Automatic timestamp triggers

#### **2. WhatsApp Notification Functions**
- ✅ `queue_whatsapp_notification()` - Queue notifications respecting preferences
- ✅ `update_whatsapp_notification_status()` - Update notification status
- ✅ `get_pending_whatsapp_notifications()` - Get pending notifications for processing

#### **3. Edge Function**
- ✅ `send-whatsapp` edge function with complete implementation
- ✅ Processes pending notifications in batches
- ✅ Handles direct sends (backwards compatibility)
- ✅ Updates notification status after sending
- ✅ Error handling and retry logic

#### **4. Features**
- ✅ **Notification Types:**
  - Emergency assignments
  - Expiry warnings
  - Deadline reminders
  - Low stock alerts
  - Assignment completed
  - Assignment cancelled
  - AI recommendations
  - System alerts
  - Custom messages

- ✅ **User Preferences:**
  - Enable/disable notifications per type
  - Quiet hours configuration
  - Timezone support
  - Per-branch preferences

- ✅ **Branch Settings:**
  - Branch-specific WhatsApp numbers (optional)
  - Default quiet hours
  - Message template prefixes
  - Timezone configuration

- ✅ **Status Tracking:**
  - pending
  - sent
  - delivered
  - read
  - failed

---

## 📁 FILES CREATED/MODIFIED

### **Backend Files Created:**
1. `supabase/migrations/20250107000005_whatsapp_notifications.sql` - Complete WhatsApp notifications system
2. `supabase/functions/send-whatsapp/index.ts` - Enhanced edge function

### **Documentation Files Created:**
1. `docs/WHATSAPP_NOTIFICATIONS_IMPLEMENTATION.md` - This file

---

## 🔧 SETUP REQUIREMENTS

### **1. Twilio Account Setup**

1. **Create Twilio Account:**
   - Sign up at https://www.twilio.com
   - Verify your account

2. **Enable WhatsApp:**
   - Go to Twilio Console → Messaging → Try it out → Send a WhatsApp message
   - Follow the setup wizard
   - Get your WhatsApp Sandbox number (for testing) or request a WhatsApp Business number (for production)

3. **Get Credentials:**
   - Account SID (from Twilio Console dashboard)
   - Auth Token (from Twilio Console dashboard)
   - WhatsApp Number (format: +14155552671, no whatsapp: prefix)

### **2. Supabase Environment Variables**

Add these to your Supabase project secrets:

```bash
# Twilio Credentials
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=+14155552671  # Your Twilio WhatsApp number
```

**To set in Supabase:**
```bash
supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid_here
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token_here
supabase secrets set TWILIO_WHATSAPP_NUMBER=+14155552671
```

### **3. Deploy Edge Function**

```bash
supabase functions deploy send-whatsapp
```

### **4. Apply Database Migration**

```bash
supabase db push
```

---

## 🚀 USAGE

### **1. Queue a Notification**

```sql
SELECT public.queue_whatsapp_notification(
  p_user_id := 'user-uuid',
  p_branch_id := 'branch-uuid',
  p_recipient_phone := '+14155552671',  -- User's WhatsApp number
  p_message_content := 'Your emergency assignment is ready!',
  p_message_type := 'emergency_assignment',
  p_related_id := 'assignment-uuid',
  p_related_type := 'emergency_assignment',
  p_metadata := '{"assignment_id": "..."}'::jsonb
);
```

### **2. Send Pending Notifications**

**Via Edge Function:**
```typescript
const { data, error } = await supabase.functions.invoke('send-whatsapp', {
  body: { process_pending: true }
})
```

**Via HTTP:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/send-whatsapp \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"process_pending": true}'
```

### **3. Direct Send (Backwards Compatibility)**

```typescript
const { data, error } = await supabase.functions.invoke('send-whatsapp', {
  body: {
    to: '+14155552671',
    message: 'Hello from WhatsApp!',
    messageType: 'custom'
  }
})
```

---

## 📱 WHATSAPP NUMBER FORMAT

### **Important:**
- Phone numbers must include country code
- Format: `+14155552671` (E.164 format)
- The edge function automatically adds `whatsapp:` prefix
- Examples:
  - ✅ `+14155552671` (US)
  - ✅ `+447911123456` (UK)
  - ✅ `+919876543210` (India)
  - ❌ `14155552671` (missing +)
  - ❌ `4155552671` (missing country code)

---

## 🔐 SECURITY FEATURES

### **Row-Level Security (RLS):**
- ✅ Users can view their own notifications
- ✅ System admins can view all notifications
- ✅ Regional managers can view regional notifications
- ✅ Branch admins can view branch notifications
- ✅ Service role can manage notifications (for edge function)

### **User Preferences:**
- ✅ Users can enable/disable notification types
- ✅ Quiet hours support (no non-critical notifications during quiet hours)
- ✅ Per-branch preferences
- ✅ Emergency and system alerts always allowed (unless completely disabled)

---

## 🔄 AUTOMATION OPTIONS

### **Option 1: Scheduled Function Calls**

Set up a cron job or scheduled task to call the edge function periodically:

```bash
# Every 5 minutes
*/5 * * * * curl -X POST https://your-project.supabase.co/functions/v1/send-whatsapp \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"process_pending": true}'
```

### **Option 2: Database Triggers**

Create triggers that automatically call the edge function when notifications are queued:

```sql
-- Note: This requires pg_net extension
CREATE OR REPLACE FUNCTION trigger_send_whatsapp()
RETURNS TRIGGER AS $$
BEGIN
  -- Call edge function via pg_net (requires extension setup)
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_send_whatsapp
  AFTER INSERT ON public.whatsapp_notifications
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION trigger_send_whatsapp();
```

### **Option 3: Supabase Cron Jobs**

If using Supabase Pro/Team, set up pg_cron jobs:

```sql
-- Schedule function to run every 5 minutes
SELECT cron.schedule(
  'send-pending-whatsapp',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := jsonb_build_object('process_pending', true)
  );
  $$
);
```

---

## 📊 MONITORING & TRACKING

### **View Pending Notifications:**
```sql
SELECT * FROM public.whatsapp_notifications
WHERE status = 'pending'
ORDER BY created_at ASC;
```

### **View Failed Notifications:**
```sql
SELECT * FROM public.whatsapp_notifications
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### **View Notification Statistics:**
```sql
SELECT 
  status,
  message_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
FROM public.whatsapp_notifications
GROUP BY status, message_type
ORDER BY count DESC;
```

---

## 🎯 RECOMMENDATIONS

### **1. Production Setup:**
- ✅ Use Twilio WhatsApp Business API (not Sandbox) for production
- ✅ Request a dedicated WhatsApp Business number
- ✅ Set up webhooks for delivery status updates
- ✅ Implement retry logic for failed messages
- ✅ Monitor notification delivery rates

### **2. Best Practices:**
- ✅ Always validate phone numbers before queuing
- ✅ Respect user preferences and quiet hours
- ✅ Use message templates for consistency
- ✅ Include clear call-to-action in messages
- ✅ Keep messages concise and actionable

### **3. Cost Optimization:**
- ✅ Batch process notifications (current: 50 at a time)
- ✅ Implement rate limiting to avoid Twilio limits
- ✅ Cache user preferences to reduce database queries
- ✅ Use quiet hours to reduce unnecessary sends

### **4. Security:**
- ✅ Never expose Twilio credentials in frontend
- ✅ Use service role key only in edge functions
- ✅ Validate phone numbers server-side
- ✅ Implement rate limiting per user/branch

---

## 🔗 INTEGRATION POINTS

### **1. Emergency Assignments:**
```typescript
// When creating emergency assignment
await supabase.rpc('queue_whatsapp_notification', {
  p_user_id: assignee.id,
  p_branch_id: branchId,
  p_recipient_phone: assignee.phone,
  p_message_content: `🚨 Emergency Assignment: ${productName} - Quantity: ${quantity}`,
  p_message_type: 'emergency_assignment',
  p_related_id: assignmentId,
  p_related_type: 'emergency_assignment'
})
```

### **2. Expiry Warnings:**
```typescript
// For items expiring soon
await supabase.rpc('queue_whatsapp_notification', {
  p_user_id: userId,
  p_branch_id: branchId,
  p_recipient_phone: userPhone,
  p_message_content: `⚠️ Expiry Warning: ${productName} expires on ${expiryDate}`,
  p_message_type: 'expiry_warning',
  p_related_id: stockItemId,
  p_related_type: 'stock_item'
})
```

### **3. Deadline Reminders:**
```typescript
// For assignment deadlines
await supabase.rpc('queue_whatsapp_notification', {
  p_user_id: userId,
  p_branch_id: branchId,
  p_recipient_phone: userPhone,
  p_message_content: `⏰ Reminder: Assignment deadline approaching for ${productName}`,
  p_message_type: 'deadline_reminder',
  p_related_id: assignmentId,
  p_related_type: 'emergency_assignment'
})
```

---

## 🧪 TESTING

### **1. Test Edge Function:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/send-whatsapp \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155552671",
    "message": "Test WhatsApp message",
    "messageType": "custom"
  }'
```

### **2. Test Queue Function:**
```sql
SELECT public.queue_whatsapp_notification(
  p_user_id := (SELECT id FROM auth.users LIMIT 1),
  p_branch_id := (SELECT id FROM public.branches LIMIT 1),
  p_recipient_phone := '+14155552671',
  p_message_content := 'Test notification',
  p_message_type := 'system_alert'
);
```

---

## 📝 NOTES

- **WhatsApp vs SMS:** WhatsApp messages are cheaper and more feature-rich than SMS
- **Rate Limits:** Twilio has rate limits for WhatsApp (check Twilio docs)
- **Template Messages:** For production, use Twilio template messages (requires approval)
- **Webhooks:** Set up webhooks for delivery status updates (recommended)
- **Testing:** Use Twilio Sandbox for development, Business API for production

---

**Last Updated:** January 2025  
**Status:** ✅ **READY FOR DEPLOYMENT**

