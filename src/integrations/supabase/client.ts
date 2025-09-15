import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pvtrcbemeesaebrwhenw.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dHJjYmVtZWVzYWVicndoZW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MjQyNzEsImV4cCI6MjA2NTAwMDI3MX0.sHDfLt6rX6-fJjHVRMhZGAvXg-W42TORjb_Plv1WtTs'

// Get the current domain - handle both development and production
const getCurrentDomain = () => {
  // Check if we're in production (Vercel)
  if (window.location.hostname === 'radar-wheat.vercel.app') {
    return 'https://radar-wheat.vercel.app'
  }
  // Check if we're in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5173'
  }
  // Check for Lovable domains
  if (window.location.hostname.includes('lovable.app') || window.location.hostname.includes('lovable.dev')) {
    return window.location.origin
  }
  // Fallback to current origin
  return window.location.origin
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
    detectSessionInUrl: true,
  }
})

// Export the domain function for use in other components
export const getAuthRedirectUrl = () => getCurrentDomain()
