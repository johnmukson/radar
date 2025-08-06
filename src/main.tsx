import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { supabase } from './integrations/supabase/client'

// Expose supabase for debugging in the console during development
if (import.meta.env.DEV) {
  ;(window as typeof window & { supabase: typeof supabase }).supabase = supabase
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
