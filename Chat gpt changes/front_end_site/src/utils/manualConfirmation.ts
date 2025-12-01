import { supabase } from '@/integrations/supabase/client'

/**
 * Manually confirm a user's email address
 * This is useful for admin users when confirmation links expire
 */
export const manuallyConfirmUser = async (email: string) => {
  try {
    // First, get the user from Supabase Auth
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      throw new Error(`Failed to fetch users: ${authError.message}`)
    }
    
    const user = authUsers.users.find(u => u.email === email)
    
    if (!user) {
      throw new Error('User not found in authentication system')
    }
    
    // Update the user's email_confirmed_at timestamp
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true
    })
    
    if (updateError) {
      throw new Error(`Failed to confirm user: ${updateError.message}`)
    }
    
    // Also update the public.users table if it exists
    try {
      const { error: publicUpdateError } = await supabase
        .from('users')
        .update({ 
          status: 'active',
          email_confirmed_at: new Date().toISOString()
        })
        .eq('username', email)
      
      if (publicUpdateError) {
        // Silent warning - public table update is optional
      }
    } catch (err) {
      // Silent warning - public table update is optional
    }
    
    return { success: true, message: 'User confirmed successfully' }
    
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    }
  }
}

/**
 * Check if a user's email is confirmed
 */
export const checkUserConfirmationStatus = async (email: string) => {
  try {
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      throw new Error(`Failed to fetch users: ${authError.message}`)
    }
    
    const user = authUsers.users.find(u => u.email === email)
    
    if (!user) {
      return { exists: false, confirmed: false }
    }
    
    return {
      exists: true,
      confirmed: !!user.email_confirmed_at,
      confirmedAt: user.email_confirmed_at
    }
    
  } catch (error) {
    return { exists: false, confirmed: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
