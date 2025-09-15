import { supabase } from '@/integrations/supabase/client'

/**
 * Clears all authentication state and localStorage data
 * Useful for debugging authentication issues
 */
export const clearAuthState = async () => {
  try {
    // Sign out from Supabase
    await supabase.auth.signOut()
    
    // Clear all localStorage items related to Supabase
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })
    
    return true
  } catch (error) {
    return false
  }
}

/**
 * Clears only invalid tokens while preserving valid sessions
 */
export const clearInvalidTokens = async () => {
  try {
    // Get current session
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      await clearAuthState()
      return true
    }
    
    if (!session) {
      await clearAuthState()
      return true
    }
    
    // Try to refresh the session to check if tokens are valid
    const { error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError) {
      await clearAuthState()
      return true
    }
    
    return false
  } catch (error) {
    await clearAuthState()
    return true
  }
}
