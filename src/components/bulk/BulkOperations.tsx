import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { 
  Package, 
  Users, 
  Edit, 
  Trash2, 
  CheckSquare, 
  Square,
  Building2,
  AlertTriangle,
  Save,
  X,
  Play,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface StockItem {
  id: string
  product_name: string
  batch_number: string | null
  expiry_date: string
  quantity: number
  unit_price: number
  branch_id: string | null
  status: string
  created_at: string
  updated_at: string
  branch_name?: string
  days_to_expiry?: number
  risk_level?: string
}

interface Dispenser {
  id: string
  name: string
  email: string
  phone: string | null
  branch_id: string | null
}

interface BulkOperationResult {
  success: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

const BulkOperations: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager, branches } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess } = useUserRole()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'stock' | 'assignment' | 'update'>('stock')
  const [loading, setLoading] = useState(false)
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [operationProgress, setOperationProgress] = useState<{ current: number; total: number } | null>(null)
  const [operationResult, setOperationResult] = useState<BulkOperationResult | null>(null)

  // Bulk Update States
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [updateField, setUpdateField] = useState<'status' | 'quantity' | 'price' | 'expiry_date'>('status')
  const [updateValue, setUpdateValue] = useState<string>('')
  const [updateQuantityType, setUpdateQuantityType] = useState<'set' | 'add' | 'subtract'>('set')
  const [updatePriceType, setUpdatePriceType] = useState<'set' | 'multiply' | 'divide'>('set')

  // Bulk Assignment States
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false)
  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [selectedDispenserIds, setSelectedDispenserIds] = useState<Set<string>>(new Set())
  const [assignmentQuantity, setAssignmentQuantity] = useState<number>(1)
  const [assignmentDeadline, setAssignmentDeadline] = useState<string>('')
  const [assignmentNotes, setAssignmentNotes] = useState<string>('')

  // Bulk Delete States
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const canPerformBulkOperations = hasAdminAccess || isSystemAdmin || isRegionalManager

  useEffect(() => {
    if (selectedBranch && canPerformBulkOperations) {
      fetchStockItems()
      if (activeTab === 'assignment') {
        fetchDispensers()
      }
    }
  }, [selectedBranch, canPerformBulkOperations, activeTab])

  const fetchStockItems = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
      let query = supabase
        .from('stock_items')
        .select(`
          *,
          branches(name)
        `)
        .eq('branch_id', selectedBranch.id)
        .eq('status', 'available')
        .order('product_name', { ascending: true })
        .limit(1000)

      if (isSystemAdmin || isRegionalManager) {
        // Allow cross-branch selection for admins
        query = supabase
          .from('stock_items')
          .select(`
            *,
            branches(name)
          `)
          .in('status', ['available', 'low_stock'])
          .order('product_name', { ascending: true })
          .limit(1000)
      }

      const { data, error } = await query

      if (error) throw error

      // Filter out items with quantity 0 (completed/out of stock items)
      const activeItems = (data || []).filter(item => (item.quantity || 0) > 0)
      const itemsWithCalculations = activeItems.map(item => {
        const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        let riskLevel = 'very-low'
        if (daysToExpiry < 0) riskLevel = 'expired'
        else if (daysToExpiry <= 30) riskLevel = 'critical'
        else if (daysToExpiry <= 60) riskLevel = 'high'
        else if (daysToExpiry <= 90) riskLevel = 'medium-high'
        else if (daysToExpiry <= 120) riskLevel = 'medium-high'
        else if (daysToExpiry <= 180) riskLevel = 'medium'
        else if (daysToExpiry <= 365) riskLevel = 'low'
        else riskLevel = 'very-low'

        return {
          ...item,
          branch_name: item.branches?.name || 'Unknown Branch',
          days_to_expiry: daysToExpiry,
          risk_level: riskLevel
        }
      })

      setStockItems(itemsWithCalculations)
    } catch (error: any) {
      console.error('Error fetching stock items:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch stock items',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchDispensers = async () => {
    if (!selectedBranch) return

    try {
      let query = supabase
        .from('users_with_roles')
        .select('*')
        .eq('role', 'dispenser')
        .eq('branch_id', selectedBranch.id)

      if (isSystemAdmin || isRegionalManager) {
        // Allow cross-branch selection for admins
        query = supabase
          .from('users_with_roles')
          .select('*')
          .eq('role', 'dispenser')
      }

      const { data, error } = await query

      if (error) throw error

      const mappedDispensers = (data || []).map(d => ({
        id: d.user_id,
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        branch_id: d.branch_id
      }))

      setDispensers(mappedDispensers)
    } catch (error: any) {
      console.error('Error fetching dispensers:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch dispensers',
        variant: 'destructive'
      })
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(stockItems.map(item => item.id)))
      setSelectAll(true)
    } else {
      setSelectedItems(new Set())
      setSelectAll(false)
    }
  }

  const handleSelectItem = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedItems)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedItems(newSelected)
    setSelectAll(newSelected.size === stockItems.length)
  }

  const handleBulkUpdate = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one item',
        variant: 'destructive'
      })
      return
    }

    if (!updateValue) {
      toast({
        title: 'Error',
        description: 'Please provide a value for the update',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    setOperationProgress({ current: 0, total: selectedItems.size })
    setOperationResult({ success: 0, failed: 0, errors: [] })

    const selectedItemsArray = Array.from(selectedItems)
    let successCount = 0
    let failedCount = 0
    const errors: Array<{ id: string; error: string }> = []

    try {
      for (let i = 0; i < selectedItemsArray.length; i++) {
        const itemId = selectedItemsArray[i]
        const item = stockItems.find(item => item.id === itemId)
        if (!item) continue

        setOperationProgress({ current: i + 1, total: selectedItemsArray.length })

        try {
          let updateData: any = {}
          let newValue: any = updateValue

          if (updateField === 'status') {
            updateData.status = newValue
          } else if (updateField === 'quantity') {
            if (updateQuantityType === 'set') {
              updateData.quantity = parseInt(newValue)
            } else if (updateQuantityType === 'add') {
              updateData.quantity = item.quantity + parseInt(newValue)
            } else if (updateQuantityType === 'subtract') {
              updateData.quantity = Math.max(0, item.quantity - parseInt(newValue))
            }
          } else if (updateField === 'price') {
            if (updatePriceType === 'set') {
              updateData.unit_price = parseFloat(newValue)
            } else if (updatePriceType === 'multiply') {
              updateData.unit_price = item.unit_price * parseFloat(newValue)
            } else if (updatePriceType === 'divide') {
              updateData.unit_price = item.unit_price / parseFloat(newValue)
            }
          } else if (updateField === 'expiry_date') {
            updateData.expiry_date = newValue
          }

          updateData.updated_at = new Date().toISOString()
          if (user) {
            updateData.last_updated_by = user.id
          }

          const { error } = await supabase
            .from('stock_items')
            .update(updateData)
            .eq('id', itemId)

          if (error) throw error
          successCount++
        } catch (error: any) {
          failedCount++
          errors.push({ id: itemId, error: error.message || 'Unknown error' })
        }
      }

      setOperationResult({ success: successCount, failed: failedCount, errors })
      
      toast({
        title: 'Bulk Update Complete',
        description: `Successfully updated ${successCount} items. ${failedCount} failed.`
      })

      setShowUpdateDialog(false)
      setSelectedItems(new Set())
      setSelectAll(false)
      fetchStockItems()
    } catch (error: any) {
      console.error('Error in bulk update:', error)
      toast({
        title: 'Error',
        description: error.message || 'Bulk update failed',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
      setOperationProgress(null)
    }
  }

  const handleBulkAssignment = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one stock item',
        variant: 'destructive'
      })
      return
    }

    if (selectedDispenserIds.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one dispenser',
        variant: 'destructive'
      })
      return
    }

    if (!assignmentDeadline) {
      toast({
        title: 'Error',
        description: 'Please provide a deadline',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    setOperationProgress({ current: 0, total: selectedItems.size * selectedDispenserIds.size })
    setOperationResult({ success: 0, failed: 0, errors: [] })

    const selectedItemsArray = Array.from(selectedItems)
    const selectedDispensersArray = Array.from(selectedDispenserIds)
    let successCount = 0
    let failedCount = 0
    const errors: Array<{ id: string; error: string }> = []

    try {
      let progressCounter = 0

      for (const itemId of selectedItemsArray) {
        const item = stockItems.find(item => item.id === itemId)
        if (!item) continue

        // Check if we have enough quantity
        const totalNeeded = assignmentQuantity * selectedDispensersArray.length
        if (item.quantity < totalNeeded) {
          failedCount++
          errors.push({ 
            id: itemId, 
            error: `Insufficient quantity. Available: ${item.quantity}, Needed: ${totalNeeded}` 
          })
          continue
        }

        for (const dispenserId of selectedDispensersArray) {
          progressCounter++
          setOperationProgress({ current: progressCounter, total: selectedItemsArray.length * selectedDispensersArray.length })

          try {
            const { error } = await supabase
              .from('emergency_assignments')
              .insert({
                stock_item_id: itemId,
                dispenser_id: dispenserId,
                quantity_assigned: assignmentQuantity,
                status: 'pending',
                deadline: assignmentDeadline,
                notes: assignmentNotes || null,
                assigned_by: user?.id || null
              })

            if (error) throw error

            // Update stock item quantity
            const { error: updateError } = await supabase
              .from('stock_items')
              .update({
                quantity: item.quantity - assignmentQuantity,
                updated_at: new Date().toISOString(),
                last_updated_by: user?.id || null
              })
              .eq('id', itemId)

            if (updateError) throw updateError

            // Record movement history
            const { error: historyError } = await supabase
              .from('stock_movement_history')
              .insert({
                stock_item_id: itemId,
                movement_type: 'assignment',
                quantity_moved: assignmentQuantity,
                from_branch_id: item.branch_id,
                to_branch_id: item.branch_id,
                for_dispenser: dispenserId,
                moved_by: user?.id || null,
                notes: assignmentNotes || null,
                movement_date: new Date().toISOString()
              })

            if (historyError) throw historyError

            successCount++
          } catch (error: any) {
            failedCount++
            errors.push({ 
              id: `${itemId}-${dispenserId}`, 
              error: error.message || 'Unknown error' 
            })
          }
        }
      }

      setOperationResult({ success: successCount, failed: failedCount, errors })
      
      toast({
        title: 'Bulk Assignment Complete',
        description: `Successfully assigned ${successCount} items. ${failedCount} failed.`
      })

      setShowAssignmentDialog(false)
      setSelectedItems(new Set())
      setSelectedDispenserIds(new Set())
      setSelectAll(false)
      fetchStockItems()
    } catch (error: any) {
      console.error('Error in bulk assignment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Bulk assignment failed',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
      setOperationProgress(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one item',
        variant: 'destructive'
      })
      return
    }

    if (deleteConfirmText !== 'DELETE') {
      toast({
        title: 'Error',
        description: 'Please type DELETE to confirm',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    setOperationProgress({ current: 0, total: selectedItems.size })
    setOperationResult({ success: 0, failed: 0, errors: [] })

    const selectedItemsArray = Array.from(selectedItems)
    let successCount = 0
    let failedCount = 0
    const errors: Array<{ id: string; error: string }> = []

    try {
      for (let i = 0; i < selectedItemsArray.length; i++) {
        const itemId = selectedItemsArray[i]
        setOperationProgress({ current: i + 1, total: selectedItemsArray.length })

        try {
          const { error } = await supabase
            .from('stock_items')
            .delete()
            .eq('id', itemId)

          if (error) throw error
          successCount++
        } catch (error: any) {
          failedCount++
          errors.push({ id: itemId, error: error.message || 'Unknown error' })
        }
      }

      setOperationResult({ success: successCount, failed: failedCount, errors })
      
      toast({
        title: 'Bulk Delete Complete',
        description: `Successfully deleted ${successCount} items. ${failedCount} failed.`
      })

      setShowDeleteDialog(false)
      setDeleteConfirmText('')
      setSelectedItems(new Set())
      setSelectAll(false)
      fetchStockItems()
    } catch (error: any) {
      console.error('Error in bulk delete:', error)
      toast({
        title: 'Error',
        description: error.message || 'Bulk delete failed',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
      setOperationProgress(null)
    }
  }

  const selectedItemsArray = useMemo(() => {
    return stockItems.filter(item => selectedItems.has(item.id))
  }, [stockItems, selectedItems])

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bulk Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to perform bulk operations.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!canPerformBulkOperations) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bulk Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to perform bulk operations.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold">
              <Package className="h-6 w-6" />
              Bulk Operations
            </CardTitle>
            <CardDescription>
              Perform bulk actions on stock items for {selectedBranch.name} ({selectedBranch.code})
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {selectedItems.size} selected
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
            <TabsList>
              <TabsTrigger value="stock">Stock Items</TabsTrigger>
              <TabsTrigger value="assignment">Bulk Assignment</TabsTrigger>
              <TabsTrigger value="update">Bulk Update</TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="space-y-4">
              {/* Selection Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label>Select All ({stockItems.length} items)</Label>
                </div>
                <div className="flex items-center gap-2">
                  {selectedItems.size > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowUpdateDialog(true)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Update Selected
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAssignmentDialog(true)}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Assign Selected
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Stock Items Table */}
              {loading && stockItems.length === 0 ? (
                <div className="text-center p-8">Loading...</div>
              ) : stockItems.length === 0 ? (
                <div className="text-center text-muted-foreground p-8">
                  No stock items available for bulk operations
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Product Name</TableHead>
                        {isSystemAdmin || isRegionalManager ? (
                          <TableHead>Branch</TableHead>
                        ) : null}
                        <TableHead>Quantity</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedItems.has(item.id)}
                              onCheckedChange={(checked) =>
                                handleSelectItem(item.id, checked as boolean)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          {isSystemAdmin || isRegionalManager ? (
                            <TableCell>{item.branch_name}</TableCell>
                          ) : null}
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>${item.unit_price.toFixed(2)}</TableCell>
                          <TableCell>{format(new Date(item.expiry_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="assignment" className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Select stock items from the Stock Items tab, then configure assignment details below.
                </AlertDescription>
              </Alert>

              {selectedItems.size === 0 ? (
                <div className="text-center text-muted-foreground p-8">
                  Please select items from the Stock Items tab first
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>Selected Items ({selectedItems.size})</Label>
                    <div className="mt-2 space-y-1">
                      {selectedItemsArray.map(item => (
                        <Badge key={item.id} variant="outline" className="mr-2">
                          {item.product_name} (Qty: {item.quantity})
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="assignment-quantity">Quantity per Assignment</Label>
                      <Input
                        id="assignment-quantity"
                        type="number"
                        min="1"
                        value={assignmentQuantity}
                        onChange={(e) => setAssignmentQuantity(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="assignment-deadline">Deadline</Label>
                      <Input
                        id="assignment-deadline"
                        type="date"
                        value={assignmentDeadline}
                        onChange={(e) => setAssignmentDeadline(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Select Dispensers</Label>
                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto border rounded p-2">
                      {dispensers.length === 0 ? (
                        <div className="text-center text-muted-foreground p-4">
                          No dispensers available
                        </div>
                      ) : (
                        dispensers.map((dispenser) => (
                          <div key={dispenser.id} className="flex items-center space-x-2">
                            <Checkbox
                              checked={selectedDispenserIds.has(dispenser.id)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedDispenserIds)
                                if (checked) {
                                  newSelected.add(dispenser.id)
                                } else {
                                  newSelected.delete(dispenser.id)
                                }
                                setSelectedDispenserIds(newSelected)
                              }}
                            />
                            <Label className="font-normal">
                              {dispenser.name} ({dispenser.email})
                            </Label>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="assignment-notes">Notes (optional)</Label>
                    <Input
                      id="assignment-notes"
                      value={assignmentNotes}
                      onChange={(e) => setAssignmentNotes(e.target.value)}
                      placeholder="Additional notes for assignments..."
                    />
                  </div>

                  <Button
                    onClick={handleBulkAssignment}
                    disabled={loading || selectedDispenserIds.size === 0 || !assignmentDeadline}
                    className="w-full"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Assign {selectedItems.size} Item(s) to {selectedDispenserIds.size} Dispenser(s)
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="update" className="space-y-4">
              <Alert>
                <Edit className="h-4 w-4" />
                <AlertDescription>
                  Select stock items from the Stock Items tab, then configure update details below.
                </AlertDescription>
              </Alert>

              {selectedItems.size === 0 ? (
                <div className="text-center text-muted-foreground p-8">
                  Please select items from the Stock Items tab first
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>Selected Items ({selectedItems.size})</Label>
                    <div className="mt-2 space-y-1">
                      {selectedItemsArray.map(item => (
                        <Badge key={item.id} variant="outline" className="mr-2">
                          {item.product_name}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="update-field">Field to Update</Label>
                    <Select
                      value={updateField}
                      onValueChange={(value: any) => setUpdateField(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="quantity">Quantity</SelectItem>
                        <SelectItem value="price">Price</SelectItem>
                        <SelectItem value="expiry_date">Expiry Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {updateField === 'quantity' && (
                    <div>
                      <Label htmlFor="quantity-type">Operation Type</Label>
                      <Select
                        value={updateQuantityType}
                        onValueChange={(value: any) => setUpdateQuantityType(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="set">Set to</SelectItem>
                          <SelectItem value="add">Add</SelectItem>
                          <SelectItem value="subtract">Subtract</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {updateField === 'price' && (
                    <div>
                      <Label htmlFor="price-type">Operation Type</Label>
                      <Select
                        value={updatePriceType}
                        onValueChange={(value: any) => setUpdatePriceType(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="set">Set to</SelectItem>
                          <SelectItem value="multiply">Multiply by</SelectItem>
                          <SelectItem value="divide">Divide by</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {updateField === 'status' && (
                    <div>
                      <Label htmlFor="status-value">Status</Label>
                      <Select
                        value={updateValue}
                        onValueChange={setUpdateValue}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="low_stock">Low Stock</SelectItem>
                          <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                          <SelectItem value="moved">Moved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {updateField === 'quantity' && (
                    <div>
                      <Label htmlFor="quantity-value">
                        {updateQuantityType === 'set' ? 'Set Quantity To' :
                         updateQuantityType === 'add' ? 'Add Quantity' :
                         'Subtract Quantity'}
                      </Label>
                      <Input
                        id="quantity-value"
                        type="number"
                        min="0"
                        value={updateValue}
                        onChange={(e) => setUpdateValue(e.target.value)}
                      />
                    </div>
                  )}

                  {updateField === 'price' && (
                    <div>
                      <Label htmlFor="price-value">
                        {updatePriceType === 'set' ? 'Set Price To' :
                         updatePriceType === 'multiply' ? 'Multiply By' :
                         'Divide By'}
                      </Label>
                      <Input
                        id="price-value"
                        type="number"
                        min="0"
                        step="0.01"
                        value={updateValue}
                        onChange={(e) => setUpdateValue(e.target.value)}
                      />
                    </div>
                  )}

                  {updateField === 'expiry_date' && (
                    <div>
                      <Label htmlFor="expiry-value">Expiry Date</Label>
                      <Input
                        id="expiry-value"
                        type="date"
                        value={updateValue}
                        onChange={(e) => setUpdateValue(e.target.value)}
                      />
                    </div>
                  )}

                  <Button
                    onClick={handleBulkUpdate}
                    disabled={loading || !updateValue}
                    className="w-full"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Update {selectedItems.size} Item(s)
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Progress Dialog */}
      {operationProgress && (
        <Dialog open={!!operationProgress} onOpenChange={() => {}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Processing...</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Progress value={(operationProgress.current / operationProgress.total) * 100} />
              <p className="text-sm text-muted-foreground">
                Processing {operationProgress.current} of {operationProgress.total} items...
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Result Dialog */}
      {operationResult && !operationProgress && (
        <Dialog open={!!operationResult} onOpenChange={() => setOperationResult(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Operation Complete</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>Success: {operationResult.success}</span>
                </div>
                {operationResult.failed > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span>Failed: {operationResult.failed}</span>
                  </div>
                )}
              </div>
              {operationResult.errors.length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                  <Label>Errors:</Label>
                  <div className="space-y-1 mt-2">
                    {operationResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-500 p-2 bg-red-50 rounded">
                        {error.id}: {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedItems.size} item(s). This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Type <strong>DELETE</strong> to confirm deletion
              </AlertDescription>
            </Alert>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleteConfirmText !== 'DELETE'}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {selectedItems.size} Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default BulkOperations

