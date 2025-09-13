-- IMMEDIATE FIX for "Failed to load notes" error
-- Copy and paste this into your Supabase SQL Editor

-- Step 1: Create the notes table
CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT true,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Step 3: Create simple policies
DROP POLICY IF EXISTS "Enable read access for all users" ON notes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notes;
DROP POLICY IF EXISTS "Enable update for users based on created_by" ON notes;
DROP POLICY IF EXISTS "Enable delete for users based on created_by" ON notes;

-- Simple read policy - anyone can read
CREATE POLICY "Enable read access for all users" ON notes
  FOR SELECT USING (true);

-- Simple insert policy - authenticated users can insert
CREATE POLICY "Enable insert for authenticated users only" ON notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Simple update policy - users can update their own notes
CREATE POLICY "Enable update for users based on created_by" ON notes
  FOR UPDATE USING (auth.uid() = created_by);

-- Simple delete policy - users can delete their own notes
CREATE POLICY "Enable delete for users based on created_by" ON notes
  FOR DELETE USING (auth.uid() = created_by);

-- Step 4: Add sample data
INSERT INTO notes (content, created_by, is_public) VALUES
('Welcome to the Notice Board!', (SELECT auth.uid()), true),
('This is a test message.', (SELECT auth.uid()), true);

-- Step 5: Verify
SELECT 'SUCCESS: Notes table created and working!' as status;
