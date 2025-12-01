-- ============================================================================
-- Scheduled Exports
-- Migration: 20250107000002_scheduled_exports.sql
-- Date: January 2025
-- Description: Creates table for scheduled exports functionality
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Scheduled Exports Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL, -- Stores export configuration (dataType, format, branchIds, filters, etc.)
  schedule TEXT NOT NULL CHECK (schedule IN ('daily', 'weekly', 'monthly')),
  schedule_time TIME NOT NULL DEFAULT '09:00:00',
  schedule_day INTEGER, -- For weekly (0-6, Sunday=0) or monthly (1-31)
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_scheduled_exports_user_id ON public.scheduled_exports(user_id);
CREATE INDEX idx_scheduled_exports_enabled ON public.scheduled_exports(enabled);
CREATE INDEX idx_scheduled_exports_next_run ON public.scheduled_exports(next_run);

-- Updated at trigger
CREATE TRIGGER update_scheduled_exports_updated_at
  BEFORE UPDATE ON public.scheduled_exports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.scheduled_exports IS 'User scheduled export configurations for automated data exports';

-- ----------------------------------------------------------------------------
-- 2. RLS Policies for Scheduled Exports
-- ----------------------------------------------------------------------------
ALTER TABLE public.scheduled_exports ENABLE ROW LEVEL SECURITY;

-- Users can manage their own scheduled exports
CREATE POLICY "Users can manage their own scheduled exports"
  ON public.scheduled_exports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System admins can view all scheduled exports
CREATE POLICY "System admins can view all scheduled exports"
  ON public.scheduled_exports
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_admin'));

-- ----------------------------------------------------------------------------
-- 3. Function to Calculate Next Run
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_next_run(
  p_schedule TEXT,
  p_schedule_time TIME,
  p_schedule_day INTEGER DEFAULT NULL,
  p_last_run TIMESTAMPTZ DEFAULT NULL
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_next_run TIMESTAMPTZ;
  v_base_date DATE;
  v_target_time TIME;
BEGIN
  v_target_time := p_schedule_time;
  v_base_date := COALESCE(p_last_run::DATE, CURRENT_DATE);

  IF p_schedule = 'daily' THEN
    -- Next run is tomorrow at the scheduled time
    v_next_run := (v_base_date + INTERVAL '1 day')::DATE + v_target_time;
    
    -- If it's already past the scheduled time today, schedule for tomorrow
    IF CURRENT_TIMESTAMP::TIME > v_target_time AND p_last_run IS NULL THEN
      v_next_run := CURRENT_DATE + INTERVAL '1 day' + v_target_time;
    END IF;
    
  ELSIF p_schedule = 'weekly' THEN
    -- Next run is on the specified day of week
    IF p_schedule_day IS NULL THEN
      -- Default to Monday (1)
      v_next_run := (CURRENT_DATE + (8 - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER) % 7)::DATE + v_target_time;
    ELSE
      -- Calculate next occurrence of the specified day
      DECLARE
        current_dow INTEGER := EXTRACT(DOW FROM CURRENT_DATE)::INTEGER;
        days_until INTEGER;
      BEGIN
        days_until := (p_schedule_day - current_dow + 7) % 7;
        IF days_until = 0 AND CURRENT_TIMESTAMP::TIME > v_target_time THEN
          days_until := 7;
        END IF;
        v_next_run := (CURRENT_DATE + days_until)::DATE + v_target_time;
      END;
    END IF;
    
  ELSIF p_schedule = 'monthly' THEN
    -- Next run is on the specified day of month
    IF p_schedule_day IS NULL THEN
      -- Default to 1st of month
      v_next_run := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE + v_target_time;
    ELSE
      -- Calculate next occurrence of the specified day
      DECLARE
        current_month DATE := DATE_TRUNC('month', CURRENT_DATE);
        next_month DATE := current_month + INTERVAL '1 month';
        target_date DATE;
      BEGIN
        -- Try to set the day in current month
        BEGIN
          target_date := (current_month + (p_schedule_day - 1) * INTERVAL '1 day')::DATE;
          IF target_date < CURRENT_DATE OR (target_date = CURRENT_DATE::DATE AND CURRENT_TIMESTAMP::TIME > v_target_time) THEN
            -- Move to next month
            target_date := (next_month + (p_schedule_day - 1) * INTERVAL '1 day')::DATE;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Day doesn't exist in month (e.g., Feb 30), use last day of month
          target_date := (next_month - INTERVAL '1 day')::DATE;
        END;
        
        v_next_run := target_date + v_target_time;
      END;
    END IF;
  END IF;

  RETURN v_next_run;
END;
$$ LANGUAGE plpgsql;

-- Comment
COMMENT ON FUNCTION public.calculate_next_run IS 'Calculates the next run time for a scheduled export based on schedule type, time, and optional day';

-- ----------------------------------------------------------------------------
-- 4. Function to Update Next Run After Execution
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_scheduled_export_after_run(
  p_export_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_export RECORD;
BEGIN
  SELECT * INTO v_export
  FROM public.scheduled_exports
  WHERE id = p_export_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.scheduled_exports
  SET 
    last_run = NOW(),
    next_run = public.calculate_next_run(
      v_export.schedule,
      v_export.schedule_time,
      v_export.schedule_day,
      NOW()
    ),
    run_count = run_count + 1
  WHERE id = p_export_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON FUNCTION public.update_scheduled_export_after_run IS 'Updates scheduled export after execution with new last_run, next_run, and incremented run_count';

