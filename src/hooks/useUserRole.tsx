import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export function useUserRole() {
  const { user } = useAuth()
  const [roles, setRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRoles = async () => {
      setLoading(true)
      
      if (!user) {
        setRoles([])
        setLoading(false)
        return
      }
      
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
        
        if (data && data.length > 0) {
          setRoles(data.map(r => r.role))
          console.log('Fetched roles for user:', user.id, 'Roles:', data.map(r => r.role))
        } else {
          // If no roles found, default to dispenser for safety
          setRoles(['dispenser'])
          console.log('No roles found for user:', user.id, 'Defaulting to dispenser')
        }
      } catch (err) {
        console.error('Error fetching roles:', err)
        // Default to dispenser for safety
        setRoles(['dispenser'])
      }
      
      setLoading(false)
    }
    fetchRoles()
  }, [user])

  const hasAdminAccess = roles.includes('admin') || roles.includes('system_admin') || roles.includes('regional_manager') || roles.includes('branch_system_admin')
  const hasDispenserAccess = roles.includes('dispenser')
  const hasDoctorAccess = roles.includes('doctor')
  const hasWriteAccess = hasAdminAccess || hasDispenserAccess // Doctors don't have write access
  const hasViewAccess = hasAdminAccess || hasDispenserAccess || hasDoctorAccess // All three can view data

  // For compatibility, return the highest role (or null)
  const userRole = roles.includes('system_admin') ? 'system_admin'
    : roles.includes('admin') ? 'admin'
    : roles.includes('regional_manager') ? 'regional_manager'
    : roles.includes('branch_system_admin') ? 'branch_system_admin'
    : roles.includes('dispenser') ? 'dispenser'
    : roles.includes('doctor') ? 'doctor'
    : null

  // Add the missing properties that AdminManager expects
  const isSystemAdmin = roles.includes('system_admin')
  const isBranchSystemAdmin = roles.includes('branch_system_admin')

  return { 
    userRole, 
    hasAdminAccess, 
    hasDispenserAccess, 
    hasDoctorAccess,
    hasWriteAccess,
    hasViewAccess,
    loading, 
    roles, 
    isSystemAdmin, 
    isBranchSystemAdmin 
  }
}
