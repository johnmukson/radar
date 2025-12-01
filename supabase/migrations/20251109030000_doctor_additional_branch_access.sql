-- ============================================================================
-- Migration: 20251109030000_doctor_additional_branch_access.sql
-- Purpose  : Extend doctor read-only policies to cover all branch-scoped tables.
-- ============================================================================

-- Branch settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branch_settings'
  ) THEN
    EXECUTE '
      DROP POLICY IF EXISTS "Doctors can view branch settings" ON public.branch_settings;
      CREATE POLICY "Doctors can view branch settings" ON public.branch_settings
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = ''doctor''::app_role
              AND ur.branch_id = public.branch_settings.branch_id
          )
        )
    ';
  END IF;
END
$$;

-- Branch notification preferences
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branch_notification_preferences'
  ) THEN
    EXECUTE '
      DROP POLICY IF EXISTS "Doctors can view branch notification preferences" ON public.branch_notification_preferences;
      CREATE POLICY "Doctors can view branch notification preferences" ON public.branch_notification_preferences
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = ''doctor''::app_role
              AND ur.branch_id = public.branch_notification_preferences.branch_id
          )
        )
    ';
  END IF;
END
$$;

-- Branch performance dashboards
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branch_performance'
  ) THEN
    EXECUTE '
      DROP POLICY IF EXISTS "Doctors can view branch performance" ON public.branch_performance;
      CREATE POLICY "Doctors can view branch performance" ON public.branch_performance
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = ''doctor''::app_role
              AND ur.branch_id = public.branch_performance.branch_id
          )
        )
    ';
  END IF;
END
$$;

-- AI recommendations (read-only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_recommendations'
  ) THEN
    EXECUTE '
      DROP POLICY IF EXISTS "Doctors can view AI recommendations" ON public.ai_recommendations;
      CREATE POLICY "Doctors can view AI recommendations" ON public.ai_recommendations
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = ''doctor''::app_role
              AND ur.branch_id = public.ai_recommendations.branch_id
          )
        )
    ';
  END IF;
END
$$;

-- Branch activity logs (optional table)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'branch_activity_logs'
  ) THEN
    EXECUTE '
      DROP POLICY IF EXISTS "Doctors can view branch activity logs" ON public.branch_activity_logs;
      CREATE POLICY "Doctors can view branch activity logs" ON public.branch_activity_logs
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = ''doctor''::app_role
              AND ur.branch_id = public.branch_activity_logs.branch_id
          )
        )
    ';
  END IF;
END
$$;

