-- ============================================================================
-- Migration: 20251108000000_unified_whatsapp_notifications.sql
-- Description:
--   1. Rename the existing whatsapp_notifications queue table so we can
--      introduce a new Twilio event log with the canonical name.
--   2. Recreate helper RPC functions to reference the renamed queue table.
--   3. Create the new whatsapp_notifications event log table that stores both
--      inbound messages and delivery status updates from Twilio using the
--      MessageSid as the primary key.
-- ============================================================================

-- 1. Rename legacy queue table (only if it still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_notifications'
  ) THEN
    ALTER TABLE public.whatsapp_notifications
    RENAME TO whatsapp_notification_queue;
  END IF;
END
$$;

-- 2. Ensure helper functions reference the renamed queue table
DROP FUNCTION IF EXISTS public.queue_whatsapp_notification(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) CASCADE;

DROP FUNCTION IF EXISTS public.update_whatsapp_notification_status(
  UUID, TEXT, TEXT, TEXT
) CASCADE;

DROP FUNCTION IF EXISTS public.get_pending_whatsapp_notifications(
  INTEGER
) CASCADE;

CREATE OR REPLACE FUNCTION public.queue_whatsapp_notification(
  p_user_id UUID,
  p_branch_id UUID,
  p_recipient_phone TEXT,
  p_message_content TEXT,
  p_message_type TEXT,
  p_related_id UUID DEFAULT NULL,
  p_related_type TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_preference RECORD;
  v_branch_settings RECORD;
  v_is_quiet_hours BOOLEAN := false;
  v_current_time TIME;
  v_user_timezone TEXT := 'UTC';
BEGIN
  -- Check if user has WhatsApp notifications enabled
  SELECT * INTO v_preference
  FROM public.whatsapp_notification_preferences
  WHERE user_id = p_user_id
    AND branch_id = p_branch_id;

  -- If no preference exists, create default one (enabled for critical notifications)
  IF NOT FOUND THEN
    IF p_message_type IN ('emergency_assignment', 'system_alert') THEN
      -- Allow notification
    ELSE
      RETURN NULL;
    END IF;
  ELSE
    -- Check if notifications are enabled
    IF NOT v_preference.enabled THEN
      RETURN NULL;
    END IF;

    -- Check if this notification type is enabled
    CASE p_message_type
      WHEN 'emergency_assignment' THEN
        IF NOT v_preference.emergency_assignments THEN RETURN NULL; END IF;
      WHEN 'expiry_warning' THEN
        IF NOT v_preference.expiry_warnings THEN RETURN NULL; END IF;
      WHEN 'deadline_reminder' THEN
        IF NOT v_preference.deadline_reminders THEN RETURN NULL; END IF;
      WHEN 'low_stock_alert' THEN
        IF NOT v_preference.low_stock_alerts THEN RETURN NULL; END IF;
      WHEN 'assignment_completed' THEN
        IF NOT v_preference.assignment_completed THEN RETURN NULL; END IF;
      WHEN 'assignment_cancelled' THEN
        IF NOT v_preference.assignment_cancelled THEN RETURN NULL; END IF;
      WHEN 'ai_recommendation' THEN
        IF NOT v_preference.ai_recommendations THEN RETURN NULL; END IF;
      WHEN 'system_alert' THEN
        IF NOT v_preference.system_alerts THEN RETURN NULL; END IF;
    END CASE;

    -- Check quiet hours
    IF v_preference.quiet_hours_start IS NOT NULL AND v_preference.quiet_hours_end IS NOT NULL THEN
      v_user_timezone := COALESCE(v_preference.timezone, 'UTC');
      v_current_time := (NOW() AT TIME ZONE v_user_timezone)::TIME;

      IF v_preference.quiet_hours_start < v_preference.quiet_hours_end THEN
        v_is_quiet_hours := v_current_time >= v_preference.quiet_hours_start
          AND v_current_time < v_preference.quiet_hours_end;
      ELSE
        v_is_quiet_hours := v_current_time >= v_preference.quiet_hours_start
          OR v_current_time < v_preference.quiet_hours_end;
      END IF;

      IF v_is_quiet_hours AND p_message_type NOT IN ('emergency_assignment', 'system_alert') THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- Get branch settings for message prefix
  SELECT * INTO v_branch_settings
  FROM public.branch_whatsapp_settings
  WHERE branch_id = p_branch_id;

  -- Apply message prefix if exists
  DECLARE
    v_final_message TEXT := p_message_content;
  BEGIN
    IF v_branch_settings.message_template_prefix IS NOT NULL
       AND v_branch_settings.message_template_prefix <> '' THEN
      v_final_message := v_branch_settings.message_template_prefix || ' ' || v_final_message;
    END IF;

    INSERT INTO public.whatsapp_notification_queue (
      user_id,
      branch_id,
      recipient_phone,
      message_content,
      message_type,
      status,
      related_id,
      related_type,
      metadata
    ) VALUES (
      p_user_id,
      p_branch_id,
      p_recipient_phone,
      v_final_message,
      p_message_type,
      'pending',
      p_related_id,
      p_related_type,
      COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.queue_whatsapp_notification IS
  'Queues a WhatsApp notification for sending, respecting user preferences and quiet hours';

CREATE OR REPLACE FUNCTION public.update_whatsapp_notification_status(
  p_notification_id UUID,
  p_status TEXT,
  p_twilio_sid TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.whatsapp_notification_queue
  SET 
    status = p_status,
    twilio_sid = COALESCE(p_twilio_sid, twilio_sid),
    error_message = COALESCE(p_error_message, error_message),
    sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END,
    read_at = CASE WHEN p_status = 'read' THEN NOW() ELSE read_at END,
    retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,
    updated_at = NOW()
  WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_whatsapp_notification_status IS
  'Updates the status of a WhatsApp notification in the queue';

CREATE OR REPLACE FUNCTION public.get_pending_whatsapp_notifications(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  branch_id UUID,
  recipient_phone TEXT,
  message_content TEXT,
  message_type TEXT,
  related_id UUID,
  related_type TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wn.id,
    wn.user_id,
    wn.branch_id,
    wn.recipient_phone,
    wn.message_content,
    wn.message_type,
    wn.related_id,
    wn.related_type,
    wn.metadata
  FROM public.whatsapp_notification_queue wn
  WHERE wn.status = 'pending'
    AND (wn.retry_count < 3 OR wn.retry_count IS NULL)
  ORDER BY wn.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_pending_whatsapp_notifications IS
  'Gets pending WhatsApp notifications for processing by the edge function';

-- 3. New Twilio event log table
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  message_sid TEXT PRIMARY KEY,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  from_number TEXT,
  to_number TEXT,
  body TEXT,
  media_count INT,
  whatsapp_profile_name TEXT,
  wa_id TEXT,
  status TEXT,
  error_code TEXT,
  error_message TEXT,
  event_type TEXT,
  raw_payload JSONB,
  twilio_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_whatsapp_notifications_updated ON public.whatsapp_notifications;

CREATE TRIGGER t_whatsapp_notifications_updated
BEFORE UPDATE ON public.whatsapp_notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_created_at
  ON public.whatsapp_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_status
  ON public.whatsapp_notifications (status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_from_to
  ON public.whatsapp_notifications (from_number, to_number);

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access" ON public.whatsapp_notifications;

CREATE POLICY "service role full access"
ON public.whatsapp_notifications
AS PERMISSIVE
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

