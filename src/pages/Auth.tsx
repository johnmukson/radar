// Supabase Auth UI does not natively support a password visibility toggle (eye icon) out of the box.
// To achieve this, you would need to build a custom Auth form instead of using <Auth />.
// If you want a custom form with an eye icon, let me know and I can scaffold it for you.
// For now, the Auth UI will remain as is, since the official component does not support this feature directly.

import React, { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Eye, EyeOff } from 'lucide-react'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResetMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/update-password',
    })
    if (error) {
      setError(error.message)
    } else {
      setResetMessage('Password reset email sent! Check your inbox.')
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2 text-white">Welcome to Expiry Guardian</h1>
          <p className="text-muted-foreground text-lg text-white">Your trusted solution for managing stock expiry and inventory risk</p>
        </div>
        {!showReset ? (
          <form onSubmit={handleSignIn} className="bg-card rounded-lg shadow-md p-8 space-y-6">
            <div>
              <label htmlFor="email" className="block mb-2 text-white">Email</label>
              <input
                id="email"
                type="email"
                className="w-full px-4 py-2 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="block mb-2 text-white">Password</label>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="w-full px-4 py-2 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none pr-10"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-slate-400 hover:text-white"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            <button
              type="submit"
              className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              disabled={loading}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
            <div className="text-center mt-4">
              <button
                type="button"
                className="text-blue-400 hover:underline text-sm"
                onClick={() => { window.location.href = 'https://radar-wheat.vercel.app/'; }}
              >
                Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleReset} className="bg-card rounded-lg shadow-md p-8 space-y-6">
            <div>
              <label htmlFor="reset-email" className="block mb-2 text-white">Enter your email to reset password</label>
              <input
                id="reset-email"
                type="email"
                className="w-full px-4 py-2 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
            {resetMessage && <div className="text-green-500 text-sm text-center">{resetMessage}</div>}
            <button
              type="submit"
              className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Email'}
            </button>
            <div className="text-center mt-4">
              <button
                type="button"
                className="text-blue-400 hover:underline text-sm"
                onClick={() => { setShowReset(false); setError(''); setResetMessage(''); }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
