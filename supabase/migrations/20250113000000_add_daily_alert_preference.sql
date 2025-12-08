-- ============================================================================
-- Add Daily Alert Preference Support
-- Migration: 20250113000000_add_daily_alert_preference.sql
-- Description: Adds daily_alert preference to whatsapp_notification_preferences
-- ============================================================================

-- Add daily_alert column to whatsapp_notification_preferences if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'whatsapp_notification_preferences' 
    AND column_name = 'daily_alert'
  ) THEN
    ALTER TABLE public.whatsapp_notification_preferences
    ADD COLUMN daily_alert BOOLEAN DEFAULT true;
    
    COMMENT ON COLUMN public.whatsapp_notification_preferences.daily_alert IS 'Enable/disable daily alert notifications';
  END IF;
END $$;

-- Update queue_whatsapp_notification function to handle daily_alert
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
    IF p_message_type IN ('emergency_assignment', 'system_alert', 'daily_alert') THEN
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
      WHEN 'daily_alert' THEN
        -- Check if daily_alert column exists and is enabled
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'whatsapp_notification_preferences' 
          AND column_name = 'daily_alert'
        ) THEN
          IF NOT COALESCE(v_preference.daily_alert, true) THEN RETURN NULL; END IF;
        END IF;
    END CASE;

    -- Check quiet hours (daily alerts should respect quiet hours)
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

      -- Daily alerts respect quiet hours (unlike emergency/system alerts)
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
'Queues a WhatsApp notification for sending, respecting user preferences and quiet hours. Now supports daily_alert type.';

