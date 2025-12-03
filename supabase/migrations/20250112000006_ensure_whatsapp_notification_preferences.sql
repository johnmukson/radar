-- ============================================================================
-- Ensure WhatsApp Notification Preferences Table Exists
-- Migration: 20250112000006_ensure_whatsapp_notification_preferences.sql
-- Description: Creates whatsapp_notification_preferences table if it doesn't exist
-- ============================================================================

-- Create whatsapp_notification_preferences table if it doesn't exist
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

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_whatsapp_preferences_user_id ON public.whatsapp_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_preferences_branch_id ON public.whatsapp_notification_preferences(branch_id);

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_whatsapp_preferences_updated_at ON public.whatsapp_notification_preferences;
CREATE TRIGGER update_whatsapp_preferences_updated_at
  BEFORE UPDATE ON public.whatsapp_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.whatsapp_notification_preferences IS 'User preferences for WhatsApp notifications per branch';

-- Enable RLS
ALTER TABLE public.whatsapp_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_notification_preferences TO authenticated;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can manage their own WhatsApp preferences" ON public.whatsapp_notification_preferences;
DROP POLICY IF EXISTS "System admins can manage all WhatsApp preferences" ON public.whatsapp_notification_preferences;
DROP POLICY IF EXISTS "Admins can manage all WhatsApp preferences" ON public.whatsapp_notification_preferences;
DROP POLICY IF EXISTS "Branch managers can view branch WhatsApp preferences" ON public.whatsapp_notification_preferences;
DROP POLICY IF EXISTS "Authenticated users can view WhatsApp preferences" ON public.whatsapp_notification_preferences;

-- Users can manage their own WhatsApp preferences
CREATE POLICY "Users can manage their own WhatsApp preferences"
  ON public.whatsapp_notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System admins can manage all WhatsApp preferences
CREATE POLICY "System admins can manage all WhatsApp preferences"
  ON public.whatsapp_notification_preferences
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

-- Admins can manage all WhatsApp preferences
CREATE POLICY "Admins can manage all WhatsApp preferences"
  ON public.whatsapp_notification_preferences
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

-- Branch managers can view branch WhatsApp preferences
CREATE POLICY "Branch managers can view branch WhatsApp preferences"
  ON public.whatsapp_notification_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('branch_manager', 'branch_system_admin')
        AND ur.branch_id = whatsapp_notification_preferences.branch_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('system_admin', 'admin')
    )
  );

-- Authenticated users can view (catch-all)
CREATE POLICY "Authenticated users can view WhatsApp preferences"
  ON public.whatsapp_notification_preferences
  FOR SELECT
  USING (auth.role() = 'authenticated');

