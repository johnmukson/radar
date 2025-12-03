-- ============================================================================
-- Add daily_alert to WhatsApp Notification Message Types
-- Migration: 20250111000001_add_daily_alert_message_type.sql
-- Description: Adds 'daily_alert' to the allowed message types
-- ============================================================================

-- Drop and recreate the check constraint to include 'daily_alert'
DO $$
BEGIN
  -- Check if message_type column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'whatsapp_notifications' 
    AND column_name = 'message_type'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.whatsapp_notifications 
      DROP CONSTRAINT IF EXISTS whatsapp_notifications_message_type_check;
    
    -- Recreate with 'daily_alert' included
    ALTER TABLE public.whatsapp_notifications
      ADD CONSTRAINT whatsapp_notifications_message_type_check 
      CHECK (message_type IN (
        'emergency_assignment',
        'expiry_warning',
        'deadline_reminder',
        'low_stock_alert',
        'assignment_completed',
        'assignment_cancelled',
        'ai_recommendation',
        'system_alert',
        'daily_alert',
        'custom'
      ));
    
    COMMENT ON COLUMN public.whatsapp_notifications.message_type IS 'Type of notification. Includes daily_alert for scheduled daily summaries.';
  ELSE
    RAISE NOTICE 'message_type column does not exist in whatsapp_notifications table. Skipping constraint update.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not update message_type constraint: %', SQLERRM;
END $$;

