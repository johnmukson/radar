import React, { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function AuthConfirm() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [emailForResend, setEmailForResend] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Detect mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const isInAppBrowser = /FBAN|FBAV|Instagram|Line|WhatsApp|Twitter|LinkedIn/i.test(navigator.userAgent)
        
        // Clear any existing invalid sessions first
        await supabase.auth.signOut()
        
        // Get the current URL hash and search params
        const hash = window.location.hash
        const searchParams = new URLSearchParams(window.location.search)
        
        // Check for various confirmation token patterns
        const hasAccessToken = hash.includes('access_token') || searchParams.has('access_token')
        const hasRefreshToken = hash.includes('refresh_token') || searchParams.has('refresh_token')
        const hasTypeParam = searchParams.get('type') === 'signup' || searchParams.get('type') === 'recovery'
        const hasToken = searchParams.has('token')
        const hasCode = searchParams.has('code')
        
        // Check for error parameters first
        const hasError = searchParams.has('error') || hash.includes('error=')
        const errorCode = searchParams.get('error_code') || hash.match(/error_code=([^&]+)/)?.[1]
        const errorDescription = searchParams.get('error_description') || hash.match(/error_description=([^&]+)/)?.[1]
        
        if (hasError) {
          if (errorCode === 'otp_expired') {
            setStatus('error')
            const mobileMessage = isMobile ? 
              'This confirmation link has expired. On mobile devices, please make sure to tap the link directly in your email app, not copy-paste it.' :
              'This confirmation link has expired. We can automatically send you a new one that will be valid for 24 hours.'
            setMessage(mobileMessage)
            // Auto-extract email from URL if available
            const emailFromUrl = searchParams.get('email') || hash.match(/email=([^&]+)/)?.[1]
            if (emailFromUrl) {
              setEmailForResend(emailFromUrl)
            }
            return
          } else if (errorCode === 'access_denied') {
            setStatus('error')
            const mobileMessage = isMobile ?
              'Access denied. On mobile devices, please try opening the confirmation link in your default browser instead of an in-app browser.' :
              'Access denied. Please request a new confirmation email.'
            setMessage(mobileMessage)
            return
          } else {
            setStatus('error')
            const mobileMessage = isMobile ?
              `Confirmation failed: ${errorDescription || 'Unknown error'}. Try opening this link in your default browser instead of an in-app browser.` :
              `Confirmation failed: ${errorDescription || 'Unknown error'}`
            setMessage(mobileMessage)
            return
          }
        }
        
        // Check if this is an email confirmation callback
        if (hasAccessToken || hasRefreshToken || hasTypeParam || hasToken || hasCode) {
          // Wait a moment for the URL to be processed by Supabase
          await new Promise(resolve => setTimeout(resolve, 1500))
          
          // Try multiple times with increasing delays
          const maxRetries = 3
          let retryCount = 0
          
          // Try multiple approaches to handle the confirmation
          let confirmationSuccessful = false
          let errorMessage = ''
          
          // Approach 1: Try to get session
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
          
          if (!sessionError && sessionData.session?.user) {
            confirmationSuccessful = true
          } else {
            // Approach 2: Try to get user directly
            const { data: userData, error: userError } = await supabase.auth.getUser()
            
            if (!userError && userData.user) {
              confirmationSuccessful = true
            } else {
              // Approach 3: Try to manually verify the email using the URL parameters
              try {
                // Extract email from URL if available
                const emailFromUrl = searchParams.get('email') || hash.match(/email=([^&]+)/)?.[1]
                
                if (emailFromUrl) {
                  // Try to resend confirmation to trigger a fresh confirmation
                  const { error: resendError } = await supabase.auth.resend({
                    type: 'signup',
                    email: emailFromUrl,
                    options: {
                      emailRedirectTo: `${window.location.origin}/auth/confirm`
                    }
                  })
                  
                  if (!resendError) {
                    setStatus('success')
                    setMessage('A new confirmation email has been sent! Please check your inbox and click the new link.')
                    return
                  }
                }
              } catch (resendErr) {
                // Continue to error handling
              }
              
              // Approach 4: Try to manually parse and handle the confirmation URL
              try {
                // Check if we have access_token in the URL
                const accessTokenMatch = hash.match(/access_token=([^&]+)/) || searchParams.get('access_token')
                const refreshTokenMatch = hash.match(/refresh_token=([^&]+)/) || searchParams.get('refresh_token')
                
                if (accessTokenMatch) {
                  // Try to set the session manually
                  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                    access_token: accessTokenMatch[1] || accessTokenMatch,
                    refresh_token: refreshTokenMatch?.[1] || refreshTokenMatch || ''
                  })
                  
                  if (!sessionError && sessionData.session?.user) {
                    confirmationSuccessful = true
                  }
                }
              } catch (manualErr) {
                // Continue to error handling
              }
              
              errorMessage = userError?.message || sessionError?.message || 'Auth session missing!'
            }
          }
          
          if (confirmationSuccessful) {
            setStatus('success')
            setMessage('Email confirmed successfully! You can now sign in.')
            setTimeout(() => {
              navigate('/dashboard')
            }, 3000)
          } else {
            setStatus('error')
            
            // Provide specific guidance for "Auth session missing!" error
            let specificMessage = errorMessage
            if (errorMessage.includes('Auth session missing') || errorMessage.includes('session missing')) {
              specificMessage = isMobile ? 
                'The confirmation link could not establish a session. This often happens on mobile devices. Please try opening the link in your default browser (Safari/Chrome) instead of an in-app browser, or request a new confirmation email.' :
                'The confirmation link could not establish a session. This may be due to browser settings or network issues. Please try requesting a new confirmation email.'
            }
            
            const mobileMessage = isMobile ? 
              `Email confirmation failed: ${specificMessage}` :
              `Email confirmation failed: ${specificMessage}`
            setMessage(mobileMessage)
            
            // Try to extract email for resend
            const emailFromUrl = searchParams.get('email') || hash.match(/email=([^&]+)/)?.[1]
            if (emailFromUrl) {
              setEmailForResend(emailFromUrl)
            }
          }
        } else {
          setStatus('error')
          setMessage('Invalid confirmation link. Please check your email or request a new confirmation.')
        }
      } catch (error) {
        setStatus('error')
        setMessage('An unexpected error occurred. Please try again.')
      }
    }

    handleEmailConfirmation()
  }, [navigate])

  const handleResendConfirmation = async () => {
    setStatus('loading')
    setMessage('')
    
    // Use email from state or extract from URL
    const searchParams = new URLSearchParams(window.location.search)
    const email = emailForResend || searchParams.get('email')
    
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
        setMessage('New confirmation email sent! Please check your inbox and click the link within 24 hours.')
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
        {/* Mobile-specific warning */}
        {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Mobile Device Detected</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>For best results on mobile:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Tap the confirmation link directly in your email app</li>
                    <li>Don't copy-paste the link</li>
                    <li>Use your default browser, not in-app browsers</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
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