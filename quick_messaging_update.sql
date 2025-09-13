-- Quick Update for Existing Messaging System
-- This updates your already deployed notes table

-- Step 1: Add missing columns to existing notes table
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 2: Update existing notes to be public
UPDATE notes SET is_public = true WHERE is_public IS NULL;

-- Step 3: Add performance indexes
CREATE INDEX IF NOT EXISTS idx_notes_is_public ON notes (is_public);
CREATE INDEX IF NOT EXISTS idx_notes_recipient_id ON notes (recipient_id);

-- Step 4: Update policies for any-user-to-any-user messaging
DROP POLICY IF EXISTS "Enable read access for all users" ON notes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notes;

-- Allow any authenticated user to read all messages
CREATE POLICY "Enable read access for all users" ON notes
  FOR SELECT USING (true);

-- Allow any authenticated user to send messages to anyone
CREATE POLICY "Enable insert for authenticated users only" ON notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Step 5: Success confirmation
SELECT 'Messaging system updated - any user can now message any user!' as status;
