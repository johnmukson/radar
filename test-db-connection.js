// Quick database connection test
// Run this with: node test-db-connection.js

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pvtrcbemeesaebrwhenw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dHJjYmVtZWVzYWVicndoZW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MjQyNzEsImV4cCI6MjA2NTAwMDI3MX0.sHDfLt6rX6-fJjHVRMhZGAvXg-W42TORjb_Plv1WtTs'

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('Testing database connection...')
console.log('Supabase URL:', supabaseUrl)

// Test connection by querying a simple table
supabase
  .from('branches')
  .select('count')
  .limit(1)
  .then(({ data, error }) => {
    if (error) {
      console.error('❌ Database connection failed:', error.message)
      process.exit(1)
    } else {
      console.log('✅ Database connection successful!')
      console.log('Response:', data)
      process.exit(0)
    }
  })
  .catch((error) => {
    console.error('❌ Connection error:', error)
    process.exit(1)
  })

