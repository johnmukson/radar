-- ============================================================================
-- Migration: Backfill Branch Notification Preferences & Audit Columns
-- Date: January 2025
-- Description:
--   1. Ensures every branch has baseline notification preferences
--      for email, WhatsApp, and in-app channels.
--   2. Backfills missing audit metadata on emergency assignments and
--      stock movement history to support new frontend expectations.
-- ============================================================================

DO $$
DECLARE
  v_default_user uuid;
BEGIN
  -- Attempt to pick a system admin to use as a fallback when we need a user id
  SELECT ur.user_id
  INTO v_default_user
  FROM public.user_roles ur
  WHERE ur.role = 'system_admin'
  ORDER BY ur.created_at
  LIMIT 1;

  -- If no system admin exists, fall back to the first auth user (can be null)
  IF v_default_user IS NULL THEN
    SELECT id INTO v_default_user
    FROM auth.users
    ORDER BY created_at
    LIMIT 1;
  END IF;

  -- --------------------------------------------------------------------------
  -- 1. Ensure each branch has baseline notification preferences
  -- --------------------------------------------------------------------------
  INSERT INTO public.branch_notification_preferences (
    branch_id,
    notification_type,
    enabled,
    channels,
    alert_thresholds,
    low_stock_threshold,
    expiry_warning_days,
    emergency_alert_enabled,
    assignment_reminder_enabled,
    deadline_reminder_days,
    created_by,
    updated_by
  )
  SELECT
    b.id,
    t.notification_type,
    CASE WHEN t.notification_type = 'whatsapp' THEN false ELSE true END AS enabled,
    '[]'::jsonb,
    '{}'::jsonb,
    10,
    30,
    true,
    true,
    7,
    v_default_user,
    v_default_user
  FROM public.branches b
  CROSS JOIN (VALUES ('email'), ('whatsapp'), ('in_app')) AS t(notification_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.branch_notification_preferences p
    WHERE p.branch_id = b.id
      AND p.notification_type = t.notification_type
  );

  -- --------------------------------------------------------------------------
  -- 2. Backfill emergency assignment audit columns
  -- --------------------------------------------------------------------------
  UPDATE public.emergency_assignments ea
  SET assigned_by = COALESCE(
    ea.assigned_by,
    (SELECT ur.user_id
     FROM public.user_roles ur
     JOIN public.stock_items si ON si.id = ea.stock_item_id
     WHERE ur.branch_id = si.branch_id
       AND ur.role IN ('branch_system_admin', 'branch_manager')
     ORDER BY ur.role, ur.created_at
     LIMIT 1),
    v_default_user,
    ea.dispenser_id -- absolute fallback: dispenser assigned themselves
  )
  WHERE ea.assigned_by IS NULL;

  -- --------------------------------------------------------------------------
  -- 3. Backfill stock movement metadata
  -- --------------------------------------------------------------------------
  UPDATE public.stock_movement_history smh
  SET
    from_branch_id = COALESCE(
      smh.from_branch_id,
      (SELECT si.branch_id FROM public.stock_items si WHERE si.id = smh.stock_item_id)
    ),
    moved_by = COALESCE(
      smh.moved_by,
      smh.for_dispenser,
      v_default_user
    )
  WHERE smh.stock_item_id IS NOT NULL
    AND (smh.from_branch_id IS NULL OR smh.moved_by IS NULL);

END $$;

-- Add a comment so future maintainers know why this migration exists
COMMENT ON SCHEMA public IS
'Backfill migration (20250108000000) inserted default branch notification preferences and normalised audit columns.';

