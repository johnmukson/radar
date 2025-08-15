import React, { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function AuthConfirm() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Get the current URL hash and search params
        const hash = window.location.hash
        const searchParams = new URLSearchParams(window.location.search)
        
        // Check if this is an email confirmation callback
        if (hash.includes('access_token') || searchParams.has('access_token')) {
          // Handle the email confirmation
          const { data, error } = await supabase.auth.getSession()
          
          if (error) {
            console.error('Email confirmation error:', error)
            setStatus('error')
            setMessage('Failed to confirm email. Please try again or contact support.')
            return
          }

          if (data.session?.user) {
            setStatus('success')
            setMessage('Email confirmed successfully! You can now sign in.')
            
            // Redirect to dashboard after a short delay
            setTimeout(() => {
              navigate('/dashboard')
            }, 3000)
          } else {
            setStatus('error')
            setMessage('Email confirmation failed. Please try again.')
          }
        } else {
          // No confirmation tokens found
          setStatus('error')
          setMessage('Invalid confirmation link. Please check your email or request a new confirmation.')
        }
      } catch (error) {
        console.error('Unexpected error during email confirmation:', error)
        setStatus('error')
        setMessage('An unexpected error occurred. Please try again.')
      }
    }

    handleEmailConfirmation()
  }, [navigate])

  const handleResendConfirmation = async () => {
    setStatus('loading')
    setMessage('')
    
    // Extract email from URL if available, or redirect to auth page
    const searchParams = new URLSearchParams(window.location.search)
    const email = searchParams.get('email')
    
    if (email) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`
        }
      })
      
      if (error) {
        setStatus('error')
        setMessage(`Error: ${error.message}`)
      } else {
        setStatus('success')
        setMessage('Confirmation email sent! Please check your inbox.')
      }
    } else {
      // Redirect to auth page if no email found
      navigate('/auth')
    }
  }

  const handleGoToAuth = () => {
    navigate('/auth')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin" />
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Confirming Email...
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Please wait while we confirm your email address.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Email Confirmed!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {message}
              </p>
              <div className="mt-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                >
                  Go to Dashboard
                </button>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-600" />
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Confirmation Failed
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {message}
              </p>
              <div className="mt-4 space-y-3">
                <button
                  onClick={handleResendConfirmation}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Resend Confirmation Email
                </button>
                <button
                  onClick={handleGoToAuth}
                  className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                >
                  Go to Sign In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 