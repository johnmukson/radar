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

  // Load selected branch from localStorage on mount
  useEffect(() => {
    if (!user || branchesLoading) {
      setLoading(branchesLoading)
      return
    }

    // If no branches available, clear selection
    if (branches.length === 0) {
      setSelectedBranchState(null)
      localStorage.removeItem(BRANCH_STORAGE_KEY)
      setLoading(false)
      return
    }

    // If single branch, auto-select it
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
        setSelectedBranchState(savedBranch)
        setLoading(false)
        return
      }
    }

    // No saved branch found, don't auto-select (user must choose)
    setSelectedBranchState(null)
    setLoading(false)
  }, [user, branches, branchesLoading])

  const setSelectedBranch = useCallback((branch: Branch) => {
    // Verify branch is in available branches
    const isValidBranch = branches.some(b => b.id === branch.id)
    if (!isValidBranch) {
      console.error('Attempted to select invalid branch:', branch.id)
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

