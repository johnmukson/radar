import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export function useUserRole() {
  const { user } = useAuth()
  const [roles, setRoles] = useState<string[]>(['admin']) // Default to admin for testing
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRoles = async () => {
      setLoading(true)
      
      // TEMPORARY FIX: Always use the fixed admin user ID for testing
      const testUserId = '74b2946d-6483-47e7-b03d-aa47cf3def5e'
      
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', testUserId)
        
        if (data && data.length > 0) {
          setRoles(data.map(r => r.role))
          console.log('Fetched roles:', data.map(r => r.role))
        } else {
          // If no roles found, keep admin default
          console.log('Fetched roles: [admin] (default for testing)')
        }
      } catch (err) {
        // Keep admin default if anything fails
        console.log('Fetched roles: [admin] (fallback for testing)')
      }
      
      setLoading(false)
    }
    fetchRoles()
  }, [user])

  const hasAdminAccess = roles.includes('admin') || roles.includes('system_admin') || roles.includes('regional_manager') || roles.includes('branch_system_admin')
  const hasDispenserAccess = roles.includes('dispenser')

  // For compatibility, return the highest role (or null)
  const userRole = roles.includes('system_admin') ? 'system_admin'
    : roles.includes('admin') ? 'admin'
    : roles.includes('regional_manager') ? 'regional_manager'
    : roles.includes('branch_system_admin') ? 'branch_system_admin'
    : roles.includes('dispenser') ? 'dispenser'
    : null

  // Add the missing properties that AdminManager expects
  const isSystemAdmin = roles.includes('system_admin')
  const isBranchSystemAdmin = roles.includes('branch_system_admin')

  return { userRole, hasAdminAccess, hasDispenserAccess, loading, roles, isSystemAdmin, isBranchSystemAdmin }
}
