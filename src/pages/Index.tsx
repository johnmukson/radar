import React, { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { useNavigate } from 'react-router-dom'

const Index = () => {
  const { user, loading: authLoading } = useAuth()
  const { selectedBranch, loading: branchLoading } = useBranch()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !branchLoading) {
      if (user) {
        // If user is authenticated but no branch selected, redirect to branch selection
        if (!selectedBranch) {
          navigate('/branch-selection')
        } else {
          navigate('/dashboard')
        }
      } else {
        navigate('/auth')
      }
    }
  }, [user, selectedBranch, authLoading, branchLoading, navigate])

  // Optionally, show a loading spinner while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

export default Index
