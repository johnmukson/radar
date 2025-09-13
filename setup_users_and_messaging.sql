-- Enhanced Setup SQL for Messaging System with Users Table
-- Copy and paste this into your Supabase SQL Editor

-- Step 1: Create users table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Create the notes table
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

-- Step 3: Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies for users table
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON users;

CREATE POLICY "Enable read access for all users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON users
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for users based on id" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Step 5: Create policies for notes table
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

-- Step 6: Create function to sync users from auth.users
CREATE OR REPLACE FUNCTION sync_user_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) 
  DO UPDATE SET
    name = COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    email = NEW.email,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create trigger to auto-sync users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_user_from_auth();

-- Step 8: Sync existing users
INSERT INTO public.users (id, name, email)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'name', email),
  email
FROM auth.users
ON CONFLICT (id) 
DO UPDATE SET
  name = COALESCE(EXCLUDED.name, users.name),
  email = EXCLUDED.email,
  updated_at = NOW();

-- Step 9: Add some sample messages
INSERT INTO notes (content, created_by, is_public) VALUES
('Welcome to the shared Notice Board! Messages are now stored in the database.', 
 (SELECT id FROM users LIMIT 1), true),
('This message is shared across all users. The database is working!', 
 (SELECT id FROM users LIMIT 1), true);

-- Step 10: Success message
SELECT 'Enhanced messaging system with users table setup completed successfully!' as status;
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_notes FROM notes;
