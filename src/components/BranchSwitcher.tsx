import React, { useState } from 'react'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, LogOut, AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'

const BranchSwitcher = () => {
  const { selectedBranch, availableBranches, hasMultipleBranches, setSelectedBranch } = useBranch()
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string>(selectedBranch?.id || '')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // Don't show switcher if user only has one branch
  if (!hasMultipleBranches) {
    return null
  }

  const handleSwitchBranch = async () => {
    if (!selectedBranchId) {
      toast({
        title: "Error",
        description: "Please select a branch to switch to.",
        variant: "destructive",
      })
      return
    }

    if (selectedBranchId === selectedBranch?.id) {
      toast({
        title: "Already Selected",
        description: "This branch is already selected.",
        variant: "default",
      })
      setOpen(false)
      return
    }

    setLoading(true)
    try {
      // Clear current branch selection
      localStorage.removeItem('selected_branch_id')
      
      // Set new branch selection
      const newBranch = availableBranches.find(b => b.id === selectedBranchId)
      if (newBranch) {
        setSelectedBranch(newBranch)
        localStorage.setItem('selected_branch_id', newBranch.id)
        
        toast({
          title: "Branch Switched",
          description: `Switched to ${newBranch.name}. Please log out and log back in to complete the switch.`,
          variant: "default",
        })
        
        // Close dialog
        setOpen(false)
        
        // Sign out to force re-authentication
        // This ensures RLS policies are properly refreshed
        setTimeout(async () => {
          await signOut()
          window.location.href = '/auth'
        }, 2000)
      }
    } catch (error) {
      console.error('Error switching branch:', error)
      toast({
        title: "Error",
        description: "Failed to switch branch. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full flex items-center gap-2 justify-start">
          <RefreshCw className="w-4 h-4" />
          <span>Switch Branch</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Switch Branch
          </DialogTitle>
          <DialogDescription>
            Select a different branch to work with. You will be logged out and need to log back in after switching.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Note:</strong> Switching branches requires re-authentication to ensure proper security and data access.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Current Branch</label>
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="font-medium">{selectedBranch?.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedBranch?.code}
                    {selectedBranch?.region && ` • ${selectedBranch.region}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Select New Branch</label>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <div>
                        <div className="font-medium">{branch.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {branch.code}
                          {branch.region && ` • ${branch.region}`}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSwitchBranch} 
            disabled={loading || !selectedBranchId || selectedBranchId === selectedBranch?.id}
            className="flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Switching...
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                Switch & Logout
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BranchSwitcher

