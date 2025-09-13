-- Setup SQL for Messaging System with Existing User Management
-- This works with your existing users and user_roles tables

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

-- Step 2: Enable Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies for notes table
DROP POLICY IF EXISTS "Enable read access for all users" ON notes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notes;
DROP POLICY IF EXISTS "Enable update for users based on created_by" ON notes;
DROP POLICY IF EXISTS "Enable delete for users based on created_by" ON notes;

CREATE POLICY "Enable read access for all users" ON notes
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for users based on created_by" ON notes
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Enable delete for users based on created_by" ON notes
  FOR DELETE USING (auth.uid() = created_by);

-- Step 4: Create trigger for updated_at
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

-- Step 5: Add some sample messages from existing users
INSERT INTO notes (content, created_by, is_public) VALUES
('Welcome to the Notice Board! All users (active and inactive) can see and send messages.', 
 (SELECT id FROM users LIMIT 1), true),
('The messaging system now works for all users regardless of their status!', 
 (SELECT id FROM users LIMIT 1), true);

-- Step 6: Success message
SELECT 'Messaging system integrated with existing User Management system successfully!' as status;
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_notes FROM notes;
