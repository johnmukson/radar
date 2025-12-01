-- ============================================================================
-- Branch-Specific Settings, Notification Preferences, and Activity Logs
-- Migration: 20250107000000_branch_settings_and_activity_logs.sql
-- Date: January 2025
-- Description: Creates tables for branch settings, notification preferences, and activity logs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Branch Settings Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(branch_id, setting_key)
);

-- Indexes
CREATE INDEX idx_branch_settings_branch_id ON public.branch_settings(branch_id);
CREATE INDEX idx_branch_settings_key ON public.branch_settings(setting_key);

-- Updated at trigger
CREATE TRIGGER update_branch_settings_updated_at
  BEFORE UPDATE ON public.branch_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.branch_settings IS 'Per-branch configuration settings including custom fields, workflows, and notification rules';

-- ----------------------------------------------------------------------------
-- 2. Branch Notification Preferences Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'email', 'whatsapp', 'in_app', 'push'
  enabled BOOLEAN DEFAULT true,
  channels JSONB DEFAULT '[]'::jsonb, -- Array of enabled channels
  alert_thresholds JSONB DEFAULT '{}'::jsonb, -- Thresholds for different alert types
  low_stock_threshold INTEGER DEFAULT 10,
  expiry_warning_days INTEGER DEFAULT 30,
  emergency_alert_enabled BOOLEAN DEFAULT true,
  assignment_reminder_enabled BOOLEAN DEFAULT true,
  deadline_reminder_days INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(branch_id, notification_type)
);

-- Indexes
CREATE INDEX idx_branch_notification_preferences_branch_id ON public.branch_notification_preferences(branch_id);
CREATE INDEX idx_branch_notification_preferences_type ON public.branch_notification_preferences(notification_type);
CREATE INDEX idx_branch_notification_preferences_enabled ON public.branch_notification_preferences(enabled);

-- Updated at trigger
CREATE TRIGGER update_branch_notification_preferences_updated_at
  BEFORE UPDATE ON public.branch_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.branch_notification_preferences IS 'Branch-specific notification preferences including channels and alert thresholds';

-- ----------------------------------------------------------------------------
-- 3. Branch Activity Logs Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'stock_movement', 'assignment', 'user_action', 'settings_change', 'upload', 'delete'
  activity_category TEXT NOT NULL, -- 'stock', 'assignment', 'user', 'settings', 'system'
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'view', 'export', etc.
  entity_type TEXT, -- 'stock_item', 'emergency_assignment', 'user', 'settings', etc.
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context data
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_branch_activity_logs_branch_id ON public.branch_activity_logs(branch_id);
CREATE INDEX idx_branch_activity_logs_user_id ON public.branch_activity_logs(user_id);
CREATE INDEX idx_branch_activity_logs_activity_type ON public.branch_activity_logs(activity_type);
CREATE INDEX idx_branch_activity_logs_activity_category ON public.branch_activity_logs(activity_category);
CREATE INDEX idx_branch_activity_logs_created_at ON public.branch_activity_logs(created_at DESC);
CREATE INDEX idx_branch_activity_logs_entity ON public.branch_activity_logs(entity_type, entity_id);

-- Comment
COMMENT ON TABLE public.branch_activity_logs IS 'Comprehensive audit trail of all activities within each branch including stock movements, assignments, user actions, and settings changes';

-- ----------------------------------------------------------------------------
-- 4. RLS Policies for Branch Settings
-- ----------------------------------------------------------------------------
ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

-- System admins can manage all branch settings
CREATE POLICY "System admins can manage all branch settings"
  ON public.branch_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

-- Branch system admins can manage their branch settings
CREATE POLICY "Branch system admins can manage their branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_settings.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_settings.branch_id
    )
  );

-- Branch managers can view and update their branch settings
CREATE POLICY "Branch managers can manage their branch settings"
  ON public.branch_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_settings.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_settings.branch_id
    )
  );

-- Users can view their branch settings
CREATE POLICY "Users can view their branch settings"
  ON public.branch_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_settings.branch_id
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RLS Policies for Branch Notification Preferences
-- ----------------------------------------------------------------------------
ALTER TABLE public.branch_notification_preferences ENABLE ROW LEVEL SECURITY;

-- System admins can manage all notification preferences
CREATE POLICY "System admins can manage all notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

-- Branch system admins can manage their branch notification preferences
CREATE POLICY "Branch system admins can manage their notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_notification_preferences.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_system_admin') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_notification_preferences.branch_id
    )
  );

-- Branch managers can view and update their branch notification preferences
CREATE POLICY "Branch managers can manage their notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'branch_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_notification_preferences.branch_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'branch_manager') AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_notification_preferences.branch_id
    )
  );

-- Users can view their branch notification preferences
CREATE POLICY "Users can view their branch notification preferences"
  ON public.branch_notification_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_notification_preferences.branch_id
    )
  );

-- ----------------------------------------------------------------------------
-- 6. RLS Policies for Branch Activity Logs
-- ----------------------------------------------------------------------------
ALTER TABLE public.branch_activity_logs ENABLE ROW LEVEL SECURITY;

-- System admins can view all activity logs
CREATE POLICY "System admins can view all activity logs"
  ON public.branch_activity_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_admin'));

-- Regional managers can view activity logs for their regions
CREATE POLICY "Regional managers can view regional activity logs"
  ON public.branch_activity_logs
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'regional_manager') AND
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_activity_logs.branch_id
      AND b.region IN (
        SELECT DISTINCT b2.region FROM public.branches b2
        WHERE EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.branch_id = b2.id
        )
      )
    )
  );

-- Branch admins and managers can view their branch activity logs
CREATE POLICY "Branch admins can view their branch activity logs"
  ON public.branch_activity_logs
  FOR SELECT
  USING (
    (public.has_role(auth.uid(), 'branch_system_admin') OR
     public.has_role(auth.uid(), 'branch_manager')) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_activity_logs.branch_id
    )
  );

-- Users can view their own activity logs
CREATE POLICY "Users can view their own activity logs"
  ON public.branch_activity_logs
  FOR SELECT
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.branch_id = branch_activity_logs.branch_id
    )
  );

-- System can insert activity logs (for triggers and functions)
CREATE POLICY "System can insert activity logs"
  ON public.branch_activity_logs
  FOR INSERT
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 7. Function to Log Activity
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_branch_activity(
  p_branch_id UUID,
  p_user_id UUID,
  p_activity_type TEXT,
  p_activity_category TEXT,
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.branch_activity_logs (
    branch_id,
    user_id,
    activity_type,
    activity_category,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) VALUES (
    p_branch_id,
    p_user_id,
    p_activity_type,
    p_activity_category,
    p_action,
    p_entity_type,
    p_entity_id,
    p_description,
    p_metadata
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.log_branch_activity IS 'Helper function to log branch activities with proper metadata';

-- ----------------------------------------------------------------------------
-- 8. Trigger to Log Stock Movement Activities
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_stock_movement_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_id UUID;
  v_description TEXT;
BEGIN
  -- Get branch_id from stock_item
  IF TG_OP = 'INSERT' THEN
    SELECT branch_id INTO v_branch_id
    FROM public.stock_items
    WHERE id = NEW.stock_item_id;

    v_description := format(
      'Stock movement: %s %s units of %s',
      NEW.movement_type,
      NEW.quantity_moved,
      (SELECT product_name FROM public.stock_items WHERE id = NEW.stock_item_id)
    );

    PERFORM public.log_branch_activity(
      v_branch_id,
      NEW.moved_by,
      'stock_movement',
      'stock',
      'create',
      'stock_movement',
      NEW.id,
      v_description,
      jsonb_build_object(
        'movement_type', NEW.movement_type,
        'quantity_moved', NEW.quantity_moved,
        'from_branch_id', NEW.from_branch_id,
        'to_branch_id', NEW.to_branch_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_stock_movement_activity
  AFTER INSERT ON public.stock_movement_history
  FOR EACH ROW
  EXECUTE FUNCTION public.log_stock_movement_activity();

-- ----------------------------------------------------------------------------
-- 9. Trigger to Log Emergency Assignment Activities
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_assignment_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_id UUID;
  v_description TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get branch_id from stock_item
    SELECT branch_id INTO v_branch_id
    FROM public.stock_items
    WHERE id = NEW.stock_item_id;

    v_description := format(
      'Emergency assignment: %s units assigned to %s',
      NEW.quantity_assigned,
      (SELECT email FROM auth.users WHERE id = NEW.dispenser_id)
    );

    PERFORM public.log_branch_activity(
      v_branch_id,
      NEW.assigned_by,
      'assignment',
      'assignment',
      'create',
      'emergency_assignment',
      NEW.id,
      v_description,
      jsonb_build_object(
        'quantity_assigned', NEW.quantity_assigned,
        'status', NEW.status,
        'deadline', NEW.deadline
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Get branch_id from stock_item
    SELECT branch_id INTO v_branch_id
    FROM public.stock_items
    WHERE id = NEW.stock_item_id;

    IF OLD.status != NEW.status THEN
      v_description := format(
        'Assignment status changed: %s → %s',
        OLD.status,
        NEW.status
      );

      PERFORM public.log_branch_activity(
        v_branch_id,
        auth.uid(),
        'assignment',
        'assignment',
        'update',
        'emergency_assignment',
        NEW.id,
        v_description,
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_assignment_activity
  AFTER INSERT OR UPDATE ON public.emergency_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_assignment_activity();

-- ----------------------------------------------------------------------------
-- 10. Trigger to Log Settings Changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_settings_change_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_description TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_description := format(
      'Branch setting created: %s',
      NEW.setting_key
    );

    PERFORM public.log_branch_activity(
      NEW.branch_id,
      NEW.created_by,
      'settings_change',
      'settings',
      'create',
      'branch_setting',
      NEW.id,
      v_description,
      jsonb_build_object(
        'setting_key', NEW.setting_key,
        'setting_value', NEW.setting_value
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_description := format(
      'Branch setting updated: %s',
      NEW.setting_key
    );

    PERFORM public.log_branch_activity(
      NEW.branch_id,
      NEW.updated_by,
      'settings_change',
      'settings',
      'update',
      'branch_setting',
      NEW.id,
      v_description,
      jsonb_build_object(
        'setting_key', NEW.setting_key,
        'old_value', OLD.setting_value,
        'new_value', NEW.setting_value
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_settings_change_activity
  AFTER INSERT OR UPDATE ON public.branch_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_settings_change_activity();

-- ----------------------------------------------------------------------------
-- 11. Trigger to Log Notification Preference Changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_notification_preference_change_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_description TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_description := format(
      'Notification preference created: %s',
      NEW.notification_type
    );

    PERFORM public.log_branch_activity(
      NEW.branch_id,
      NEW.created_by,
      'settings_change',
      'settings',
      'create',
      'notification_preference',
      NEW.id,
      v_description,
      jsonb_build_object(
        'notification_type', NEW.notification_type,
        'enabled', NEW.enabled
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.enabled != NEW.enabled THEN
      v_description := format(
        'Notification preference %s: %s',
        NEW.notification_type,
        CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END
      );

      PERFORM public.log_branch_activity(
        NEW.branch_id,
        NEW.updated_by,
        'settings_change',
        'settings',
        'update',
        'notification_preference',
        NEW.id,
        v_description,
        jsonb_build_object(
          'notification_type', NEW.notification_type,
          'old_enabled', OLD.enabled,
          'new_enabled', NEW.enabled
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_notification_preference_change_activity
  AFTER INSERT OR UPDATE ON public.branch_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.log_notification_preference_change_activity();

