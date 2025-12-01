import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase, getAuthRedirectUrl } from '@/integrations/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  resendConfirmationEmail: (email: string) => Promise<{ error: AuthError | null }>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Handle token errors by clearing invalid sessions
        if (event === 'TOKEN_REFRESHED' && !session) {
          await supabase.auth.signOut()
          setSession(null)
          setUser(null)
        } else {
          setSession(session)
          setUser(session?.user ?? null)
        }
        setLoading(false)
      }
    )

    // Get initial session with error handling
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Clear invalid session
        supabase.auth.signOut()
        setSession(null)
        setUser(null)
      } else {
        setSession(session)
        setUser(session?.user ?? null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${getAuthRedirectUrl()}/auth/confirm`
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const resendConfirmationEmail = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${getAuthRedirectUrl()}/auth/confirm`
      }
    })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  const value = {
    user,
    session,
    signUp,
    signIn,
    signOut,
    resendConfirmationEmail,
    loading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
