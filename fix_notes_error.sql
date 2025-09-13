-- Fix "Failed to load notes" error
-- Copy and paste this entire script into your Supabase SQL Editor

-- Step 1: Create the notes table if it doesn't exist
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

-- Step 2: Enable Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Step 3: Create basic policies (drop existing ones first)
DROP POLICY IF EXISTS "Anyone can read public notes" ON notes;
DROP POLICY IF EXISTS "Users can read their private messages" ON notes;
DROP POLICY IF EXISTS "Authenticated users can insert public notes" ON notes;
DROP POLICY IF EXISTS "Authenticated users can send private messages" ON notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON notes;

-- Create new policies
CREATE POLICY "Anyone can read public notes" ON notes
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can read their private messages" ON notes
  FOR SELECT USING (
    auth.uid() = created_by OR 
    auth.uid() = recipient_id
  );

CREATE POLICY "Authenticated users can insert public notes" ON notes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    is_public = true AND
    auth.uid() = created_by
  );

CREATE POLICY "Authenticated users can send private messages" ON notes
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

-- Step 4: Add some sample data to test
INSERT INTO notes (content, created_by, is_public) VALUES
('Welcome to the Notice Board! This is a public message.', 
 (SELECT auth.uid()), true),
('System is working correctly. You can now send messages!', 
 (SELECT auth.uid()), true);

-- Step 5: Verify the setup
SELECT 'Notes table created successfully!' as message;
SELECT COUNT(*) as total_notes FROM notes;
