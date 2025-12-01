import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extracts a meaningful error message from various error object types
 * Prevents "[object Object]" errors in toast notifications
 */
export function extractErrorMessage(error: unknown, defaultMessage: string = "An error occurred"): string {
  if (error && typeof error === 'object') {
    // Handle Supabase error objects
    if ('message' in error && typeof error.message === 'string') {
      return error.message
    }
    if ('error' in error && typeof error.error === 'string') {
      return error.error
    }
    if ('details' in error && typeof error.details === 'string') {
      return error.details
    }
    if ('hint' in error && typeof error.hint === 'string') {
      return error.hint
    }
    // Handle PostgrestError objects
    if ('code' in error && 'message' in error) {
      return `${error.code}: ${error.message}`
    }
  } else if (typeof error === 'string') {
    return error
  }
  
  return defaultMessage
}
