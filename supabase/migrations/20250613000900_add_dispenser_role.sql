-- Migration: Add dispenser role to app_role enum
-- Date: 2025-06-13
-- Description: This migration adds the 'dispenser' value to the app_role enum

-- Add dispenser value to app_role enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'dispenser') THEN
        ALTER TYPE public.app_role ADD VALUE 'dispenser';
    END IF;
END $$; 