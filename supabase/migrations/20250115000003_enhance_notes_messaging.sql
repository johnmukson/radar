-- Enhance notes table for public/private messaging functionality
-- Add new columns to existing notes table

-- Add is_public column (defaults to true for existing notes)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- Add recipient_id column for private messages
ALTER TABLE notes ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update existing notes to be public (since they were created before this feature)
UPDATE notes SET is_public = true WHERE is_public IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notes_is_public ON notes (is_public);
CREATE INDEX IF NOT EXISTS idx_notes_recipient_id ON notes (recipient_id);

-- Update RLS policies to handle public/private messages
DROP POLICY IF EXISTS "Anyone can read notes" ON notes;
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON notes;

-- Create new policies for public/private messaging
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
    is_public = true
  );

CREATE POLICY "Authenticated users can send private messages" ON notes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    is_public = false AND
    auth.uid() = created_by
  );

CREATE POLICY "Users can update their own notes" ON notes
  FOR UPDATE USING (
    auth.uid() = created_by
  );

CREATE POLICY "Users can delete their own notes" ON notes
  FOR DELETE USING (
    auth.uid() = created_by
  );
