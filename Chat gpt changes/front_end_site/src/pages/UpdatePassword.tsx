import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useNavigate } from 'react-router-dom'

export default function UpdatePassword() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase password recovery link contains the access token in the URL hash
    // We don't need to parse it manually, the client does it automatically
    // when it initializes. We just need to listen for the PASSWORD_RECOVERY event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMessage('You can now set your new password.')
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully! Redirecting to login...')
      setTimeout(() => {
        navigate('/auth')
      }, 3000)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2 text-white">Set a New Password</h1>
          <p className="text-muted-foreground text-lg text-white">Enter and confirm your new password below.</p>
        </div>
        <form onSubmit={handleUpdatePassword} className="bg-card rounded-lg shadow-md p-8 space-y-6">
          <div>
            <label htmlFor="new-password" className="block mb-2 text-white">New Password</label>
            <input
              id="new-password"
              type="password"
              className="w-full px-4 py-2 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          {message && <div className="text-green-500 text-sm text-center">{message}</div>}
          <button
            type="submit"
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            disabled={loading || !password}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
} 