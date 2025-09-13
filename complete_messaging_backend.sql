-- Complete Backend SQL for Enhanced Messaging System
-- Run this in your Supabase SQL Editor

-- ========================================
-- 1. CREATE NOTES TABLE (if not exists)
-- ========================================
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

-- ========================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ========================================
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes (created_by);
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes (parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_public ON notes (is_public);
CREATE INDEX IF NOT EXISTS idx_notes_recipient_id ON notes (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at);

-- ========================================
-- 4. CREATE RLS POLICIES
-- ========================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read public notes" ON notes;
DROP POLICY IF EXISTS "Users can read their private messages" ON notes;
DROP POLICY IF EXISTS "Authenticated users can insert public notes" ON notes;
DROP POLICY IF EXISTS "Authenticated users can send private messages" ON notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON notes;

-- Policy 1: Anyone can read public notes (Notice Board)
CREATE POLICY "Anyone can read public notes" ON notes
  FOR SELECT USING (is_public = true);

-- Policy 2: Users can read their private messages (sent to them or sent by them)
CREATE POLICY "Users can read their private messages" ON notes
  FOR SELECT USING (
    auth.uid() = created_by OR 
    auth.uid() = recipient_id
  );

-- Policy 3: Authenticated users can post to Notice Board
CREATE POLICY "Authenticated users can insert public notes" ON notes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    is_public = true AND
    auth.uid() = created_by
  );

-- Policy 4: Authenticated users can send private messages
CREATE POLICY "Authenticated users can send private messages" ON notes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    is_public = false AND
    auth.uid() = created_by AND
    recipient_id IS NOT NULL
  );

-- Policy 5: Users can update their own notes
CREATE POLICY "Users can update their own notes" ON notes
  FOR UPDATE USING (
    auth.uid() = created_by
  );

-- Policy 6: Users can delete their own notes
CREATE POLICY "Users can delete their own notes" ON notes
  FOR DELETE USING (
    auth.uid() = created_by
  );

-- ========================================
-- 5. CREATE TRIGGER FOR UPDATED_AT
-- ========================================
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

-- ========================================
-- 6. CREATE USEFUL VIEWS
-- ========================================

-- View for public messages (Notice Board)
CREATE OR REPLACE VIEW public_messages AS
SELECT 
  n.*,
  COALESCE(u.raw_user_meta_data->>'name', u.email, 'Unknown User') as sender_name,
  u.email as sender_email
FROM notes n
LEFT JOIN auth.users u ON n.created_by = u.id
WHERE n.is_public = true AND n.parent_id IS NULL
ORDER BY n.created_at DESC;

-- View for private message threads
CREATE OR REPLACE VIEW private_message_threads AS
SELECT 
  n.*,
  COALESCE(sender.raw_user_meta_data->>'name', sender.email, 'Unknown User') as sender_name,
  sender.email as sender_email,
  COALESCE(recipient.raw_user_meta_data->>'name', recipient.email, 'Unknown User') as recipient_name,
  recipient.email as recipient_email
FROM notes n
LEFT JOIN auth.users sender ON n.created_by = sender.id
LEFT JOIN auth.users recipient ON n.recipient_id = recipient.id
WHERE n.is_public = false AND n.parent_id IS NULL
ORDER BY n.created_at DESC;

-- ========================================
-- 7. INSERT SAMPLE DATA (Optional)
-- ========================================

-- Sample public notice board messages
INSERT INTO notes (content, created_by, is_public) VALUES
('Welcome to the Notice Board! Post important announcements here.', 
 (SELECT id FROM auth.users LIMIT 1), true),
('System maintenance scheduled for tomorrow at 2 AM.', 
 (SELECT id FROM auth.users LIMIT 1), true);

-- ========================================
-- 8. VERIFICATION QUERIES
-- ========================================

-- Check if table was created successfully
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'notes' 
ORDER BY ordinal_position;

-- Check if policies are active
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'notes';

-- ========================================
-- SUCCESS MESSAGE
-- ========================================
SELECT 'Enhanced messaging system backend setup completed successfully!' as status;
