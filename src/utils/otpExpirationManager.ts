/**
 * OTP Expiration Management Utilities
 * Helps manage and warn users about OTP expiration
 */

export interface OTPInfo {
  email: string
  sentAt: Date
  expiresAt: Date
  isExpired: boolean
  timeRemaining: number // in minutes
}

/**
 * Calculate OTP expiration info
 */
export const calculateOTPExpiration = (email: string, sentAt: Date, expiryHours: number = 24): OTPInfo => {
  const expiresAt = new Date(sentAt.getTime() + (expiryHours * 60 * 60 * 1000))
  const now = new Date()
  const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60)))
  const isExpired = now > expiresAt

  return {
    email,
    sentAt,
    expiresAt,
    isExpired,
    timeRemaining
  }
}

/**
 * Get user-friendly time remaining message
 */
export const getTimeRemainingMessage = (timeRemaining: number): string => {
  if (timeRemaining <= 0) {
    return 'This confirmation link has expired'
  } else if (timeRemaining < 60) {
    return `This confirmation link expires in ${timeRemaining} minutes`
  } else if (timeRemaining < 1440) { // Less than 24 hours
    const hours = Math.floor(timeRemaining / 60)
    const minutes = timeRemaining % 60
    return `This confirmation link expires in ${hours} hours and ${minutes} minutes`
  } else {
    const days = Math.floor(timeRemaining / 1440)
    const hours = Math.floor((timeRemaining % 1440) / 60)
    return `This confirmation link expires in ${days} days and ${hours} hours`
  }
}

/**
 * Check if OTP is close to expiration (within 1 hour)
 */
export const isOTPCloseToExpiration = (timeRemaining: number): boolean => {
  return timeRemaining > 0 && timeRemaining <= 60
}

/**
 * Get warning level for OTP expiration
 */
export const getOTPWarningLevel = (timeRemaining: number): 'none' | 'warning' | 'critical' => {
  if (timeRemaining <= 0) return 'critical'
  if (timeRemaining <= 60) return 'warning' // Less than 1 hour
  return 'none'
}

/**
 * Store OTP info in localStorage for tracking
 */
export const storeOTPInfo = (email: string, sentAt: Date, expiryHours: number = 24): void => {
  const otpInfo = calculateOTPExpiration(email, sentAt, expiryHours)
  localStorage.setItem(`otp_${email}`, JSON.stringify({
    ...otpInfo,
    sentAt: sentAt.toISOString(),
    expiresAt: otpInfo.expiresAt.toISOString()
  }))
}

/**
 * Get stored OTP info
 */
export const getStoredOTPInfo = (email: string): OTPInfo | null => {
  try {
    const stored = localStorage.getItem(`otp_${email}`)
    if (!stored) return null

    const parsed = JSON.parse(stored)
    return {
      ...parsed,
      sentAt: new Date(parsed.sentAt),
      expiresAt: new Date(parsed.expiresAt)
    }
  } catch {
    return null
  }
}

/**
 * Clear stored OTP info
 */
export const clearStoredOTPInfo = (email: string): void => {
  localStorage.removeItem(`otp_${email}`)
}
