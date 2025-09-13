-- Create notes table for user comments with messaging functionality
CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Create policies for notes (accessible to anyone with read access, only authenticated users can create/edit)
CREATE POLICY "Anyone can read notes" ON notes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert notes" ON notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own notes" ON notes
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own notes" ON notes
  FOR DELETE USING (auth.uid() = created_by);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notes_updated_at 
  BEFORE UPDATE ON notes 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
