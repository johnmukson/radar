import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth()
  const { selectedBranch, loading: branchLoading } = useBranch()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !branchLoading) {
      if (!user) {
        navigate('/auth')
      } else if (!selectedBranch) {
        navigate('/branch-selection')
      }
    }
  }, [user, selectedBranch, authLoading, branchLoading, navigate])

  if (authLoading || branchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  if (!selectedBranch) {
    return null // Will redirect
  }

  return <>{children}</>
}

