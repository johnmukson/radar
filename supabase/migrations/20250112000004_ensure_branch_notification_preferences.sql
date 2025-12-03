-- ============================================================================
-- Ensure Branch Notification Preferences Table Exists
-- Migration: 20250112000004_ensure_branch_notification_preferences.sql
-- Description: Creates branch_notification_preferences table if it doesn't exist
-- ============================================================================

-- Create branch_notification_preferences table if it doesn't exist
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

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_branch_notification_preferences_branch_id ON public.branch_notification_preferences(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_notification_preferences_type ON public.branch_notification_preferences(notification_type);
CREATE INDEX IF NOT EXISTS idx_branch_notification_preferences_enabled ON public.branch_notification_preferences(enabled);

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_branch_notification_preferences_updated_at ON public.branch_notification_preferences;
CREATE TRIGGER update_branch_notification_preferences_updated_at
  BEFORE UPDATE ON public.branch_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.branch_notification_preferences IS 'Branch-specific notification preferences including channels and alert thresholds';

-- Enable RLS
ALTER TABLE public.branch_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_notification_preferences TO authenticated;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "System admins can manage all notification preferences" ON public.branch_notification_preferences;
DROP POLICY IF EXISTS "Admins can manage all notification preferences" ON public.branch_notification_preferences;
DROP POLICY IF EXISTS "Branch system admins can manage their notification preferences" ON public.branch_notification_preferences;
DROP POLICY IF EXISTS "Branch managers can manage their notification preferences" ON public.branch_notification_preferences;
DROP POLICY IF EXISTS "Regional managers can manage regional notification preferences" ON public.branch_notification_preferences;
DROP POLICY IF EXISTS "Users can view notification preferences" ON public.branch_notification_preferences;
DROP POLICY IF EXISTS "Authenticated users can view notification preferences" ON public.branch_notification_preferences;

-- System admins can manage all notification preferences
CREATE POLICY "System admins can manage all notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'system_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'system_admin'
    )
  );

-- Admins can manage all notification preferences
CREATE POLICY "Admins can manage all notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'admin'
    )
  );

-- Branch system admins can manage their branch notification preferences
CREATE POLICY "Branch system admins can manage their notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND ur.branch_id = branch_notification_preferences.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_system_admin'
        AND ur.branch_id = branch_notification_preferences.branch_id
    )
  );

-- Branch managers can manage their branch notification preferences
CREATE POLICY "Branch managers can manage their notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND ur.branch_id = branch_notification_preferences.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'branch_manager'
        AND ur.branch_id = branch_notification_preferences.branch_id
    )
  );

-- Regional managers can manage notification preferences in their region
CREATE POLICY "Regional managers can manage regional notification preferences"
  ON public.branch_notification_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND b.region = (SELECT region FROM public.branches WHERE id = branch_notification_preferences.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.branches b ON b.id = ur.branch_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'regional_manager'
        AND b.region = (SELECT region FROM public.branches WHERE id = branch_notification_preferences.branch_id)
    )
  );

-- Users can view notification preferences for their branch
CREATE POLICY "Users can view notification preferences"
  ON public.branch_notification_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.branch_id = branch_notification_preferences.branch_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('system_admin', 'admin')
    )
  );

-- Authenticated users can view (catch-all)
CREATE POLICY "Authenticated users can view notification preferences"
  ON public.branch_notification_preferences
  FOR SELECT
  USING (auth.role() = 'authenticated');

