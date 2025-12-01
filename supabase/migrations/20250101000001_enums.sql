-- Migration: Enumerations
-- Description: Define enumerated types for roles, task priority, task status and notification types
-- Enums help enforce valid values and make policies clearer

-- Roles a user can have in the system
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typtype = 'e'
  ) THEN
    CREATE TYPE app_role AS ENUM (
      'system_admin',
      'branch_system_admin',
      'regional_manager',
      -- An administrator within a branch. In the front‑end UI this is labelled
      -- "Admin" and has permissions similar to a branch manager or inventory assistant.
      'admin',
      'branch_manager',
      'inventory_assistant',
      'dispenser',
      'doctor'
    );
  END IF;
END
$$;

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'system_admin';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'branch_system_admin';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'regional_manager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'branch_manager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'inventory_assistant';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dispenser';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'doctor';

-- Priority levels for weekly tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'task_priority' AND typtype = 'e'
  ) THEN
    CREATE TYPE task_priority AS ENUM ('urgent','high','medium','low');
  END IF;
END
$$;

ALTER TYPE task_priority ADD VALUE IF NOT EXISTS 'urgent';
ALTER TYPE task_priority ADD VALUE IF NOT EXISTS 'high';
ALTER TYPE task_priority ADD VALUE IF NOT EXISTS 'medium';
ALTER TYPE task_priority ADD VALUE IF NOT EXISTS 'low';

-- Status values for weekly tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'task_status' AND typtype = 'e'
  ) THEN
    CREATE TYPE task_status AS ENUM ('pending','in_progress','completed','overdue');
  END IF;
END
$$;

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'overdue';

-- Types of WhatsApp notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_type' AND typtype = 'e'
  ) THEN
    CREATE TYPE notification_type AS ENUM ('weekly_task','emergency_assignment','general');
  END IF;
END
$$;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'weekly_task';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'emergency_assignment';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'general';

-- Status of WhatsApp notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_status' AND typtype = 'e'
  ) THEN
    CREATE TYPE notification_status AS ENUM ('pending','sent','failed');
  END IF;
END
$$;

ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'failed';

