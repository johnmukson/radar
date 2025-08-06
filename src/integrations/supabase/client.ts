import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pvtrcbemeesaebrwhenw.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dHJjYmVtZWVzYWVicndoZW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MjQyNzEsImV4cCI6MjA2NTAwMDI3MX0.sHDfLt6rX6-fJjHVRMhZGAvXg-W42TORjb_Plv1WtTs'

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
})
