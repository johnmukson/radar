-- ============================================================================
-- WhatsApp Notifications System
-- Migration: 20250107000005_whatsapp_notifications.sql
-- Date: January 2025
-- Description: Creates WhatsApp notification system using Twilio WhatsApp API
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WhatsApp Notifications Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL, -- WhatsApp phone number (with country code, e.g., +14155552671)
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'emergency_assignment',
    'expiry_warning',
    'deadline_reminder',
    'low_stock_alert',
    'assignment_completed',
    'assignment_cancelled',
    'ai_recommendation',
    'system_alert',
    'custom'
  )),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')) DEFAULT 'pending',
  twilio_sid TEXT, -- Twilio message SID for tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional data like related IDs, template data, etc.
  related_id UUID, -- Related entity ID (e.g., emergency_assignment_id, stock_item_id)
  related_type TEXT -- Type of related entity
);

-- Indexes
CREATE INDEX idx_whatsapp_notifications_user_id ON public.whatsapp_notifications(user_id);
CREATE INDEX idx_whatsapp_notifications_branch_id ON public.whatsapp_notifications(branch_id);
CREATE INDEX idx_whatsapp_notifications_status ON public.whatsapp_notifications(status);
CREATE INDEX idx_whatsapp_notifications_message_type ON public.whatsapp_notifications(message_type);
CREATE INDEX idx_whatsapp_notifications_created_at ON public.whatsapp_notifications(created_at DESC);
CREATE INDEX idx_whatsapp_notifications_recipient_phone ON public.whatsapp_notifications(recipient_phone);
CREATE INDEX idx_whatsapp_notifications_pending ON public.whatsapp_notifications(status, created_at) 
  WHERE status = 'pending';

-- Updated at trigger
CREATE TRIGGER update_whatsapp_notifications_updated_at
  BEFORE UPDATE ON public.whatsapp_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.whatsapp_notifications IS 'WhatsApp notifications sent via Twilio WhatsApp API for emergency assignments, expiry warnings, deadlines, and system alerts';

-- ----------------------------------------------------------------------------
-- 2. WhatsApp Notification Preferences Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  whatsapp_phone TEXT NOT NULL, -- User's WhatsApp phone number
  enabled BOOLEAN DEFAULT true,
  emergency_assignments BOOLEAN DEFAULT true,
  expiry_warnings BOOLEAN DEFAULT true,
  deadline_reminders BOOLEAN DEFAULT true,
  low_stock_alerts BOOLEAN DEFAULT false,
  assignment_completed BOOLEAN DEFAULT true,
  assignment_cancelled BOOLEAN DEFAULT true,
  ai_recommendations BOOLEAN DEFAULT false,
  system_alerts BOOLEAN DEFAULT true,
  quiet_hours_start TIME, -- Start of quiet hours (e.g., '22:00:00')
  quiet_hours_end TIME, -- End of quiet hours (e.g., '08:00:00')
  timezone TEXT DEFAULT 'UTC', -- User's timezone
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, branch_id)
);

-- Indexes
CREATE INDEX idx_whatsapp_preferences_user_id ON public.whatsapp_notification_preferences(user_id);
CREATE INDEX idx_whatsapp_preferences_branch_id ON public.whatsapp_notification_preferences(branch_id);

-- Updated at trigger
CREATE TRIGGER update_whatsapp_preferences_updated_at
  BEFORE UPDATE ON public.whatsapp_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.whatsapp_notification_preferences IS 'User preferences for WhatsApp notifications per branch';

-- ----------------------------------------------------------------------------
-- 3. Branch WhatsApp Settings Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT true,
  twilio_whatsapp_number TEXT, -- Branch-specific WhatsApp number (optional)
  default_quiet_hours_start TIME DEFAULT '22:00:00',
  default_quiet_hours_end TIME DEFAULT '08:00:00',
  timezone TEXT DEFAULT 'UTC',
  message_template_prefix TEXT DEFAULT '', -- Custom prefix for all messages
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updated at trigger
CREATE TRIGGER update_branch_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.branch_whatsapp_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.branch_whatsapp_settings IS 'Branch-specific WhatsApp notification settings and configuration';

-- ----------------------------------------------------------------------------
-- 4. RLS Policies for WhatsApp Notifications
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own WhatsApp notifications
CREATE POLICY "Users can view own WhatsApp notifications"
  ON public.whatsapp_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- System admins can view all WhatsApp notifications
CREATE POLICY "System admins can view all WhatsApp notifications"
  ON public.whatsapp_notifications
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_admin'));

-- Regional managers can view WhatsApp notifications for their regions
CREATE POLICY "Regional managers can view regional WhatsApp notifications"
  ON public.whatsapp_notifications
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'regional_manager') AND
    (
      branch_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.branches b ON b.id = ur.branch_id
        WHERE ur.user_id = auth.uid()
        AND b.region = (SELECT region FROM public.branches WHERE id = whatsapp_notifications.branch_id)
      )
    )
  );

-- Branch admins can view WhatsApp notifications for their branch
CREATE POLICY "Branch admins can view branch WhatsApp notifications"
  ON public.whatsapp_notifications
  FOR SELECT
  USING (
    (public.has_role(auth.uid(), 'branch_system_admin') OR
     public.has_role(auth.uid(), 'branch_manager')) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = whatsapp_notifications.branch_id
    )
  );

-- Service role can insert/update notifications (for edge function)
CREATE POLICY "Service role can manage WhatsApp notifications"
  ON public.whatsapp_notifications
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ----------------------------------------------------------------------------
-- 5. RLS Policies for WhatsApp Notification Preferences
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can manage own WhatsApp preferences"
  ON public.whatsapp_notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System admins can view all preferences
CREATE POLICY "System admins can view all WhatsApp preferences"
  ON public.whatsapp_notification_preferences
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_admin'));

-- Branch admins can view preferences for their branch
CREATE POLICY "Branch admins can view branch WhatsApp preferences"
  ON public.whatsapp_notification_preferences
  FOR SELECT
  USING (
    (public.has_role(auth.uid(), 'branch_system_admin') OR
     public.has_role(auth.uid(), 'branch_manager')) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = whatsapp_notification_preferences.branch_id
    )
  );

-- ----------------------------------------------------------------------------
-- 6. RLS Policies for Branch WhatsApp Settings
-- ----------------------------------------------------------------------------
ALTER TABLE public.branch_whatsapp_settings ENABLE ROW LEVEL SECURITY;

-- System admins can manage all branch WhatsApp settings
CREATE POLICY "System admins can manage branch WhatsApp settings"
  ON public.branch_whatsapp_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

-- Branch system admins can manage their branch settings
CREATE POLICY "Branch system admins can manage branch WhatsApp settings"
  ON public.branch_whatsapp_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_whatsapp_settings.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_whatsapp_settings.branch_id
    )
  );

-- Users can view branch WhatsApp settings
CREATE POLICY "Users can view branch WhatsApp settings"
  ON public.branch_whatsapp_settings
  FOR SELECT
  USING (
    branch_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_whatsapp_settings.branch_id
    )
  );

-- ----------------------------------------------------------------------------
-- 7. Function to Queue WhatsApp Notification
-- ----------------------------------------------------------------------------
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
    -- Check if notification type is critical (always send)
    IF p_message_type IN ('emergency_assignment', 'system_alert') THEN
      -- Allow notification
    ELSE
      -- User hasn't set preferences, don't send non-critical notifications
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
        IF NOT v_preference.emergency_assignments THEN
          RETURN NULL;
        END IF;
      WHEN 'expiry_warning' THEN
        IF NOT v_preference.expiry_warnings THEN
          RETURN NULL;
        END IF;
      WHEN 'deadline_reminder' THEN
        IF NOT v_preference.deadline_reminders THEN
          RETURN NULL;
        END IF;
      WHEN 'low_stock_alert' THEN
        IF NOT v_preference.low_stock_alerts THEN
          RETURN NULL;
        END IF;
      WHEN 'assignment_completed' THEN
        IF NOT v_preference.assignment_completed THEN
          RETURN NULL;
        END IF;
      WHEN 'assignment_cancelled' THEN
        IF NOT v_preference.assignment_cancelled THEN
          RETURN NULL;
        END IF;
      WHEN 'ai_recommendation' THEN
        IF NOT v_preference.ai_recommendations THEN
          RETURN NULL;
        END IF;
      WHEN 'system_alert' THEN
        IF NOT v_preference.system_alerts THEN
          RETURN NULL;
        END IF;
    END CASE;

    -- Check quiet hours
    IF v_preference.quiet_hours_start IS NOT NULL AND v_preference.quiet_hours_end IS NOT NULL THEN
      v_user_timezone := COALESCE(v_preference.timezone, 'UTC');
      v_current_time := (NOW() AT TIME ZONE v_user_timezone)::TIME;
      
      IF v_preference.quiet_hours_start < v_preference.quiet_hours_end THEN
        -- Same day quiet hours (e.g., 22:00 - 08:00 next day)
        v_is_quiet_hours := v_current_time >= v_preference.quiet_hours_start AND v_current_time < v_preference.quiet_hours_end;
      ELSE
        -- Overnight quiet hours (e.g., 22:00 - 08:00)
        v_is_quiet_hours := v_current_time >= v_preference.quiet_hours_start OR v_current_time < v_preference.quiet_hours_end;
      END IF;

      -- Don't send non-critical notifications during quiet hours
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
    IF v_branch_settings.message_template_prefix IS NOT NULL AND v_branch_settings.message_template_prefix != '' THEN
      v_final_message := v_branch_settings.message_template_prefix || ' ' || v_final_message;
    END IF;

    -- Insert notification
    INSERT INTO public.whatsapp_notifications (
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
    ) RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.queue_whatsapp_notification IS 'Queues a WhatsApp notification for sending, respecting user preferences and quiet hours';

-- ----------------------------------------------------------------------------
-- 8. Function to Update WhatsApp Notification Status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_whatsapp_notification_status(
  p_notification_id UUID,
  p_status TEXT,
  p_twilio_sid TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.whatsapp_notifications
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

-- Comment
COMMENT ON FUNCTION public.update_whatsapp_notification_status IS 'Updates the status of a WhatsApp notification';

-- ----------------------------------------------------------------------------
-- 9. Function to Get Pending WhatsApp Notifications
-- ----------------------------------------------------------------------------
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
  FROM public.whatsapp_notifications wn
  WHERE wn.status = 'pending'
    AND (wn.retry_count < 3 OR wn.retry_count IS NULL) -- Max 3 retries
  ORDER BY wn.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.get_pending_whatsapp_notifications IS 'Gets pending WhatsApp notifications for processing by edge function';

