import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { extractErrorMessage } from '@/lib/utils'
import type { Database } from '@/integrations/supabase/types'

type AppRole = Database['public']['Enums']['app_role']

interface UserRole {
  id: string
  user_id: string
  role: AppRole
  branch_id: string | null
  created_at: string
  branches?: {
    name: string
    code: string
  } | null
  users?: {
    name: string
    email: string
  } | null
}

interface AuthUser {
  id: string
  email?: string
}

interface Branch {
  id: string
  name: string
  code: string
  region: string | null
}

export const useAdminManager = () => {
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const loadBranches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, code, region')
        .order('name')

      if (error) throw error
      setBranches(data || [])
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to load branches")
      console.error('Error loading branches:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }, [toast])

  const loadUserRoles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          branches(name, code),
          users(name, email)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setUserRoles(data || [])
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to load user roles")
      console.error('Error loading user roles:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }, [toast])

  const assignRole = async (userEmail: string, selectedRole: AppRole, selectedBranch: string) => {
    toast({
      title: "Error",
      description: "Assigning roles to users requires backend support. Please contact the developer to enable this feature securely.",
      variant: "destructive",
    })
    return
  }

  const removeUserRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId)

      if (error) throw error

      toast({
        title: "Success",
        description: "User role removed successfully",
      })

      await loadUserRoles()
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to remove user role")
      console.error('Error removing user role:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    loadUserRoles()
    loadBranches()
  }, [loadUserRoles, loadBranches])

  return {
    userRoles,
    branches,
    loading,
    assignRole,
    removeUserRole
  }
}
