import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserBranches, Branch } from '@/hooks/useUserBranches'

interface BranchContextType {
  selectedBranch: Branch | null
  availableBranches: Branch[]
  setSelectedBranch: (branch: Branch) => void
  loading: boolean
  hasMultipleBranches: boolean
  isSystemAdmin: boolean
  isRegionalManager: boolean
  error: string | null
  clearBranchSelection: () => void
}

const BranchContext = createContext<BranchContextType | undefined>(undefined)

const BRANCH_STORAGE_KEY = 'selected_branch_id'

export const useBranch = () => {
  const context = useContext(BranchContext)
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider')
  }
  return context
}

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { branches, loading: branchesLoading, error: branchesError } = useUserBranches()
  const [selectedBranch, setSelectedBranchState] = useState<Branch | null>(null)
  const [loading, setLoading] = useState(true)

  // Check if user is system admin or regional manager
  const isSystemAdmin = branches.some(b => b.role === 'system_admin')
  const isRegionalManager = branches.some(b => b.role === 'regional_manager')

  // Load selected branch from localStorage on mount and preserve selection
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    // If still loading branches, preserve current selection (don't clear it)
    if (branchesLoading) {
      // Try to restore from localStorage if we don't have a selection yet
      if (!selectedBranch) {
        const savedBranchId = localStorage.getItem(BRANCH_STORAGE_KEY)
        if (savedBranchId) {
          // Keep the saved branch ID in localStorage, we'll validate it once branches load
          // Don't clear it during loading
        }
      }
      setLoading(branchesLoading)
      return
    }

    // If there's an error loading branches, preserve the current selection
    if (branchesError && branches.length === 0) {
      // If we have a saved branch ID, try to keep it (don't clear on temporary errors)
      const savedBranchId = localStorage.getItem(BRANCH_STORAGE_KEY)
      if (savedBranchId && selectedBranch?.id === savedBranchId) {
        // Keep the current selection even if branches failed to load
        setLoading(false)
        return
      }
      // Only clear if we truly have no branches and no saved selection
      if (!savedBranchId) {
        setSelectedBranchState(null)
      }
      setLoading(false)
      return
    }

    // If no branches available (and no error), clear selection
    if (branches.length === 0 && !branchesError) {
      setSelectedBranchState(null)
      localStorage.removeItem(BRANCH_STORAGE_KEY)
      setLoading(false)
      return
    }

    // If single branch, auto-select it (even if different from saved)
    if (branches.length === 1) {
      const branch = branches[0]
      setSelectedBranchState(branch)
      localStorage.setItem(BRANCH_STORAGE_KEY, branch.id)
      setLoading(false)
      return
    }

    // If multiple branches, check localStorage for previously selected branch
    const savedBranchId = localStorage.getItem(BRANCH_STORAGE_KEY)
    if (savedBranchId) {
      const savedBranch = branches.find(b => b.id === savedBranchId)
      if (savedBranch) {
        // Valid saved branch found - use it (preserve selection)
        setSelectedBranchState(savedBranch)
        localStorage.setItem(BRANCH_STORAGE_KEY, savedBranch.id) // Ensure it's saved
        setLoading(false)
        return
      } else {
        // Saved branch is no longer accessible, but user has other branches
        // Only clear if the branch is truly not in the list (not just a loading error)
        if (branches.length > 0) {
          console.warn(`Saved branch ${savedBranchId} is no longer accessible. Available branches:`, branches.map(b => b.id))
          localStorage.removeItem(BRANCH_STORAGE_KEY)
          // Don't auto-select - let user choose from available branches
          setSelectedBranchState(null)
          setLoading(false)
          return
        }
        // If branches.length === 0 but we got here, it might be an error - preserve selection
      }
    }

    // No saved branch found, but if we already have a selection, keep it
    if (selectedBranch && branches.some(b => b.id === selectedBranch.id)) {
      // Current selection is still valid, keep it
      setLoading(false)
      return
    }

    // No saved branch and no current valid selection - don't auto-select
    setSelectedBranchState(null)
    setLoading(false)
  }, [user, branches, branchesLoading, branchesError, selectedBranch])

  const setSelectedBranch = useCallback((branch: Branch) => {
    // Verify branch is in available branches
    const isValidBranch = branches.some(b => b.id === branch.id)
    if (!isValidBranch) {
      console.error('Attempted to select invalid branch:', branch.id)
      console.error('Available branches:', branches.map(b => ({ id: b.id, name: b.name })))
      // Clear invalid selection from localStorage
      localStorage.removeItem(BRANCH_STORAGE_KEY)
      return
    }

    // Verify branch is active
    const branchData = branches.find(b => b.id === branch.id)
    if (branchData && branchData.status !== 'active') {
      console.warn('Attempted to select inactive branch:', branch.id)
      return
    }

    setSelectedBranchState(branch)
    localStorage.setItem(BRANCH_STORAGE_KEY, branch.id)
  }, [branches])

  const clearBranchSelection = useCallback(() => {
    setSelectedBranchState(null)
    localStorage.removeItem(BRANCH_STORAGE_KEY)
  }, [])

  const value: BranchContextType = {
    selectedBranch,
    availableBranches: branches,
    setSelectedBranch,
    loading: loading || branchesLoading,
    hasMultipleBranches: branches.length > 1,
    isSystemAdmin,
    isRegionalManager,
    error: branchesError,
    clearBranchSelection
  }

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

