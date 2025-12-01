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
    
    try {
      // Option 1: Use Edge function if available
      const { error: functionError } = await supabase.functions.invoke('add-branch', {
        body: { branch_name: branchName, region },
      })
      
      if (functionError) {
        // Fallback: Create branch directly
        const { data: codeData } = await supabase.rpc('generate_branch_code')
        const branchCode = codeData || 'BR0001'
        
        const { error: insertError } = await supabase
          .from('branches')
          .insert({
            name: branchName,
            code: branchCode,
            region: region || null,
            status: 'active'
          })
        
        if (insertError) throw insertError
      }
      
      toast({ title: 'Success', description: 'Branch created successfully' })
      setOpen(false)
      setBranchName('')
      setRegion('Central')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create branch'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
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
            <div>
              <label className="text-sm font-medium mb-2 block">Branch Name</label>
              <Input
                placeholder="Branch name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Region</label>
              <Input
                placeholder="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

