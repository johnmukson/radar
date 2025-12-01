import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

/**
 * A simple form that allows administrators to create a new branch.
 * Only users with admin privileges should render this component.
 */
export default function AddBranchButton() {
  const [open, setOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [region, setRegion] = useState('Central')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreate = async () => {
    if (!branchName) {
      toast({ title: 'Validation Error', description: 'Branch name is required', variant: 'destructive' })
      return
    }
    setLoading(true)
    const { error } = await supabase.functions.invoke('add-branch', {
      body: { branch_name: branchName, region },
    })
    setLoading(false)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Success', description: 'Branch created successfully' })
      setOpen(false)
      setBranchName('')
    }
  }

  return (
    <div className="my-4">
      <Button onClick={() => setOpen(true)}>Add Branch</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Branch name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
            <Input
              placeholder="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}