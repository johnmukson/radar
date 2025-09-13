-- Update Existing Messaging System SQL
-- This script updates the already deployed notes table to work with your User Management system
-- Run this in your Supabase SQL Editor

-- Step 1: Check if notes table exists and show current structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'notes' 
ORDER BY ordinal_position;

-- Step 2: Add columns if they don't exist (safe to run multiple times)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 3: Update existing notes to be public (if they don't have the is_public column set)
UPDATE notes SET is_public = true WHERE is_public IS NULL;

-- Step 4: Add indexes for performance (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_notes_is_public ON notes (is_public);
CREATE INDEX IF NOT EXISTS idx_notes_recipient_id ON notes (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes (created_by);
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes (parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at);

-- Step 5: Update RLS policies to work with your User Management system
-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can read public notes" ON notes;
DROP POLICY IF EXISTS "Users can read their private messages" ON notes;
DROP POLICY IF EXISTS "Authenticated users can insert public notes" ON notes;
DROP POLICY IF EXISTS "Authenticated users can send private messages" ON notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON notes;
DROP POLICY IF EXISTS "Enable read access for all users" ON notes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notes;
DROP POLICY IF EXISTS "Enable update for users based on created_by" ON notes;
DROP POLICY IF EXISTS "Enable delete for users based on created_by" ON notes;

-- Create updated policies that work with your User Management system
CREATE POLICY "Anyone can read public notes" ON notes
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can read their private messages" ON notes
  FOR SELECT USING (
    auth.uid() = created_by OR 
    auth.uid() = recipient_id
  );

CREATE POLICY "Any authenticated user can send public messages" ON notes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    is_public = true AND
    auth.uid() = created_by
  );

CREATE POLICY "Any authenticated user can send private messages to any user" ON notes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    is_public = false AND
    auth.uid() = created_by AND
    recipient_id IS NOT NULL
  );

CREATE POLICY "Users can update their own notes" ON notes
  FOR UPDATE USING (
    auth.uid() = created_by
  );

CREATE POLICY "Users can delete their own notes" ON notes
  FOR DELETE USING (
    auth.uid() = created_by
  );

-- Step 6: Create or update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Verify the update
SELECT 'Messaging system updated successfully!' as status;
SELECT COUNT(*) as total_notes FROM notes;
SELECT COUNT(*) as public_notes FROM notes WHERE is_public = true;
SELECT COUNT(*) as private_notes FROM notes WHERE is_public = false;

-- Step 8: Show current policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'notes';
