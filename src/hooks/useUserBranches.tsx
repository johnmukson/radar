import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export interface Branch {
  id: string
  name: string
  code: string
  region: string | null
  status: string | null
}

export interface UserBranch extends Branch {
  role: string
  branch_id: string
}

export function useUserBranches() {
  const { user } = useAuth()
  const [branches, setBranches] = useState<UserBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBranches = async () => {
      setLoading(true)
      // Don't clear error immediately - keep previous error until we have new data
      // setError(null) - commented out to preserve error state

      if (!user) {
        setBranches([])
        setError(null)
        setLoading(false)
        return
      }

      try {
        // First, get user's roles to check if they're system admin or regional manager
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)

        if (rolesError) {
          console.error('Error fetching user roles:', rolesError)
          // Don't throw - try to continue with a fallback approach
          // Set error but don't clear branches (preserve what we have)
          setError(`Failed to fetch user roles: ${rolesError.message}`)
          
          // Try to fetch branches directly without role check (fallback)
          try {
            const { data: fallbackBranches, error: fallbackError } = await supabase
              .from('branches')
              .select('id, name, code, region, status')
              .eq('status', 'active')
              .order('name')
              .limit(1) // Just try to see if we can access branches at all
            
            if (fallbackError) {
              throw rolesError // Use original error
            }
          } catch (fallbackErr) {
            throw rolesError // Use original error
          }
          
          // If we get here, we can't proceed - but don't clear existing branches
          setLoading(false)
          return
        }
        
        // Clear error on successful role fetch
        setError(null)

        const userRoles = rolesData?.map(r => r.role) || []
        const isSystemAdmin = userRoles.includes('system_admin')
        const isRegionalManager = userRoles.includes('regional_manager')

        // System admins and regional managers can see all branches
        if (isSystemAdmin || isRegionalManager) {
          const { data: allBranches, error: branchesError } = await supabase
            .from('branches')
            .select('id, name, code, region, status')
            .eq('status', 'active')
            .order('name')

          if (branchesError) throw branchesError

          // Map to UserBranch format with highest role
          const mappedBranches: UserBranch[] = (allBranches || []).map(branch => ({
            ...branch,
            role: isSystemAdmin ? 'system_admin' : 'regional_manager',
            branch_id: branch.id
          }))

          setBranches(mappedBranches)
          setLoading(false)
          return
        }

        // For other users, get their assigned branches from user_roles
        const { data: userRolesData, error: userRolesError } = await supabase
          .from('user_roles')
          .select(`
            role,
            branch_id,
            branch:branches!inner (
              id,
              name,
              code,
              region,
              status
            )
          `)
          .eq('user_id', user.id)
          .not('branch_id', 'is', null)

        if (userRolesError) throw userRolesError

        // Map to UserBranch format
        const mappedBranches: UserBranch[] = (userRolesData || [])
          .filter(ur => ur.branch && ur.branch.status === 'active')
          .map(ur => ({
            id: ur.branch.id,
            name: ur.branch.name,
            code: ur.branch.code,
            region: ur.branch.region,
            status: ur.branch.status,
            role: ur.role,
            branch_id: ur.branch_id
          }))

        // Remove duplicates (user might have multiple roles for same branch)
        const uniqueBranches = Array.from(
          new Map(mappedBranches.map(b => [b.id, b])).values()
        )

        setBranches(uniqueBranches)
        setError(null) // Clear error on success
      } catch (err) {
        console.error('Error fetching user branches:', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch branches'
        setError(errorMessage)
        // Don't clear branches on error - preserve existing branches to maintain selection
        // The branches state will keep its previous value, maintaining the selected branch
        // This ensures branch selection persists even during temporary network errors
      } finally {
        setLoading(false)
      }
    }

    fetchBranches()
  }, [user])

  return { branches, loading, error }
}

