import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, MapPin, Code, AlertCircle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

const BranchSelection = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { 
    availableBranches, 
    selectedBranch, 
    setSelectedBranch, 
    loading, 
    hasMultipleBranches,
    error 
  } = useBranch()

  // If user is not authenticated, redirect to auth
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth')
    }
  }, [user, loading, navigate])

  // If single branch or already selected (remembered from previous session), auto-redirect
  useEffect(() => {
    if (!loading && selectedBranch) {
      // Auto-redirect if:
      // 1. Single branch (always auto-select)
      // 2. Branch already selected from previous session (remembered in localStorage)
      if (!hasMultipleBranches) {
        // Single branch - always redirect
        navigate('/dashboard')
      } else if (selectedBranch) {
        // Multiple branches but branch already selected - redirect (user can switch later)
        navigate('/dashboard')
      }
    }
  }, [selectedBranch, hasMultipleBranches, loading, navigate])

  const handleBranchSelect = (branch: typeof availableBranches[0]) => {
    setSelectedBranch(branch)
    navigate('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading branches...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Error loading branches:</strong> {error}
            <br />
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (availableBranches.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              No Branches Assigned
            </CardTitle>
            <CardDescription className="text-slate-400">
              You don't have access to any branches. Please contact your administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              onClick={() => navigate('/auth')}
              className="w-full"
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Select Your Branch</h1>
          <p className="text-slate-400">
            Choose the branch you want to work with. You can switch branches by logging out and logging back in.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableBranches.map((branch) => (
            <Card
              key={branch.id}
              className={`cursor-pointer transition-all hover:scale-105 bg-slate-800 border-slate-700 ${
                selectedBranch?.id === branch.id ? 'ring-2 ring-blue-500 border-blue-500' : ''
              }`}
              onClick={() => handleBranchSelect(branch)}
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <Building2 className="h-6 w-6 text-blue-400" />
                  {selectedBranch?.id === branch.id && (
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                  )}
                </div>
                <CardTitle className="text-white text-lg">{branch.name}</CardTitle>
                <CardDescription className="text-slate-400 flex items-center gap-1 mt-1">
                  <Code className="h-3 w-3" />
                  {branch.code}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {branch.region && (
                  <div className="flex items-center gap-1 text-slate-400 text-sm mb-3">
                    <MapPin className="h-3 w-3" />
                    {branch.region}
                  </div>
                )}
                <Button
                  className="w-full"
                  variant={selectedBranch?.id === branch.id ? 'default' : 'outline'}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBranchSelect(branch)
                  }}
                >
                  {selectedBranch?.id === branch.id ? 'Selected' : 'Select Branch'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {hasMultipleBranches && (
          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              You have access to {availableBranches.length} branches. 
              Select one to continue.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default BranchSelection

