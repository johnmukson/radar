import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { format, endOfMonth } from 'date-fns'
import { isExpired } from '@/utils/expiryUtils'
import { 
  Download, 
  Search, 
  Filter, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Package,
  Calendar,
  DollarSign,
  Users
} from 'lucide-react'
import { useStockAdjuster } from '@/contexts/StockAdjusterContext'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronsUpDown } from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'

interface StockItem {
  id: string
  product_name: string
  branch: string
  expiry_date: string
  quantity: number
  unit_price: number
  created_at: string
  is_emergency: boolean
  emergency_declared_at: string | null
  assigned_to?: string | null
  assigned_to_name?: string | null
  assigned_to_email?: string | null
}

console.log('StockList component mounted'); // Debug: component mount

const StockList = () => {
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const { hasAdminAccess } = useUserRole()
  const { toast } = useToast()
  const { openAdjustModal } = useStockAdjuster()
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(1)
  const [adjustLoading, setAdjustLoading] = useState(false)

  const fetchStockItems = async () => {
    console.log('fetchStockItems called'); // Debug: fetch function called
    try {
      const { data, error } = await supabase
        .from('stock_items')
        .select('*')
        .order('is_emergency', { ascending: false })
        .order('created_at', { ascending: false })

      console.log('Stock items:', data, 'Error:', error); // Debug log

      if (error) {
        throw error
      }

      setStockItems(data || [])
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to fetch stock items"
      
      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message
        } else if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error
        } else if ('details' in error && typeof error.details === 'string') {
          errorMessage = error.details
        } else if ('hint' in error && typeof error.hint === 'string') {
          errorMessage = error.hint
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    console.log('useEffect running');
    fetchStockItems()
  }, [])

  const calculateRiskLevel = (expiryDate: string) => {
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) return { level: 'Expired', color: 'destructive' }
    if (daysUntilExpiry <= 30) return { level: 'Critical', color: 'destructive' }      // 0-30 days
    if (daysUntilExpiry <= 60) return { level: 'High', color: 'warning' }             // 31-60 days (Critical range)
    if (daysUntilExpiry <= 90) return { level: 'Medium-High', color: 'warning' }     // 61-90 days (High priority range)
    if (daysUntilExpiry <= 120) return { level: 'Medium-High', color: 'warning' }    // 91-120 days (Medium-high priority range)
    if (daysUntilExpiry <= 180) return { level: 'Medium', color: 'success' }         // 121-180 days (Medium priority range)
    if (daysUntilExpiry <= 365) return { level: 'Low', color: 'default' }            // 181-365 days (Low priority range)
    return { level: 'Very Low', color: 'default' }                                   // 365+ days (Very low priority range)
  }

  const deleteStockItem = async (id: string, item: StockItem) => {
    try {
      // First record the movement in history
      const { error: movementError } = await supabase
        .from('stock_movement_history')
        .insert({
          stock_item_id: id,
          movement_type: 'removed',
          quantity_moved: item.quantity,
          from_branch_id: null, // We'll need to get the branch_id from the item
          notes: `Item removed by admin: ${item.product_name}`,
          moved_by: null // We'll need to get the current user ID
        })

      if (movementError) {
        console.error('Error recording movement:', movementError)
      }

      // Then delete the item
      const { error } = await supabase
        .from('stock_items')
        .delete()
        .eq('id', id)

      if (error) {
        throw error
      }

      setStockItems(stockItems.filter(stockItem => stockItem.id !== id))
      toast({
        title: "Success",
        description: "Stock item deleted successfully",
      })
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to delete stock item"
      
      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message
        } else if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error
        } else if ('details' in error && typeof error.details === 'string') {
          errorMessage = error.details
        } else if ('hint' in error && typeof error.hint === 'string') {
          errorMessage = error.hint
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  // Mock user and dispenser data for demonstration
  const currentUser = 'admin_user' // Replace with actual user from context/auth
  const userRole = hasAdminAccess ? 'admin' : 'dispenser'
  const dispensers = [
    { id: '1', name: 'John Doe', username: '@johnson' },
    { id: '2', name: 'Jane Smith', username: '@janesmith' }
  ]

  // IMMUTABLE LAW: Expired items are those whose expiry date is earlier or is in the current month
  const today = new Date()
  const nonExpiredItems = stockItems.filter(item => !isExpired(item.expiry_date))
  const expiredItems = stockItems.filter(item => isExpired(item.expiry_date))

  // Group items by expiry categories (UNIFORM RANGES)
  const groupByExpiry = (items: StockItem[]) => {
    const groups: Record<string, StockItem[]> = {
      '31-60': [],
      '61-90': [],
      '91-120': [],
      '121-180': [],
      '181-365': [],
      '365+': [],
    }
    items.forEach(item => {
      const days = Math.ceil((new Date(item.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (days >= 31 && days <= 60) groups['31-60'].push(item)
      else if (days >= 61 && days <= 90) groups['61-90'].push(item)
      else if (days >= 91 && days <= 120) groups['91-120'].push(item)
      else if (days >= 121 && days <= 180) groups['121-180'].push(item)
      else if (days >= 181 && days <= 365) groups['181-365'].push(item)
      else if (days > 365) groups['365+'].push(item)
    })
    return groups
  }
  const grouped = groupByExpiry(nonExpiredItems)
  const categoryLabels: Record<string, string> = {
    '31-60': '31–60 days (High Priority)',
    '61-90': '61–90 days (Medium-High Priority)',
    '91-120': '91–120 days (Medium-High Priority)',
    '121-180': '121–180 days (Medium Priority)',
    '181-365': '181–365 days (Low Priority)',
    '365+': '365+ days (Very Low Priority)',
  }

  // Download CSV helper
  const downloadCSV = (items: StockItem[], group: string) => {
    const headers = ['Product Name', 'Branch', 'Expiry Date', 'Quantity', 'Unit Price', 'Total Value', 'Assigned To']
    const csvContent = [
      headers.join(','),
      ...items.map(item => [
        item.product_name,
        item.branch,
        format(new Date(item.expiry_date), 'yyyy-MM-dd'),
        item.quantity,
        item.unit_price,
        item.unit_price * item.quantity,
        item.assigned_to_name || item.assigned_to_email || 'Unassigned'
      ].join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', `stock_items_${group}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenAdjust = (item: StockItem) => {
    setAdjustItem(item)
    setAdjustQty(1)
    setAdjustDialogOpen(true)
  }

  const handleAdjustSubmit = async () => {
    if (!adjustItem || adjustQty < 1 || adjustQty > adjustItem.quantity) return
    setAdjustLoading(true)
    try {
      const newQty = adjustItem.quantity - adjustQty
      const updateObj: { quantity: number; status?: string } = { quantity: newQty }
      if (newQty === 0) updateObj.status = 'completed'
      const { error: updateError } = await supabase
        .from('stock_items')
        .update(updateObj)
        .eq('id', adjustItem.id)
      if (updateError) throw updateError
      // Record movement
      const { data: { user } } = await supabase.auth.getUser()
      const movementType = newQty === 0 ? 'completion' : 'dispense'
      const notes = newQty === 0 
        ? `COMPLETED: ${adjustQty} units of ${adjustItem.product_name} - Item fully consumed`
        : `Dispensed ${adjustQty} units of ${adjustItem.product_name}`
      
      await supabase.from('stock_movement_history').insert({
        stock_item_id: adjustItem.id,
        movement_type: movementType,
        quantity_moved: adjustQty,
        to_branch_id: (adjustItem as StockItem & { branch_id?: string }).branch_id || null,
        notes: notes,
        moved_by: user?.id || null
      })

      // If quantity reached zero, update any associated weekly_tasks to completed
      if (newQty === 0) {
        await supabase
          .from('weekly_tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .like('title', `%${adjustItem.product_name}%`)
          .eq('status', 'pending')
      }
      setAdjustDialogOpen(false)
      setAdjustItem(null)
      setAdjustQty(1)
      setStockItems(prev => prev.map(item => item.id === adjustItem.id ? { ...item, quantity: newQty } : item))
      toast({ title: 'Success', description: 'Stock adjusted.' })
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to adjust stock"
      
      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message
        } else if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error
        } else if ('details' in error && typeof error.details === 'string') {
          errorMessage = error.details
        } else if ('hint' in error && typeof error.hint === 'string') {
          errorMessage = error.hint
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' })
    } finally {
      setAdjustLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  console.log('Rendering StockList return');
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Stock Items</h2>
        <Button onClick={fetchStockItems} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Grouped Stock Items */}
      {Object.keys(categoryLabels).map((group) => {
        const isOpen = openCategory === group;
        return (
          <div key={group} className="mb-6">
            <div
              className="flex justify-between items-center mb-2 bg-[#232b39] hover:bg-[#2c3444] p-6 rounded-xl cursor-pointer transition-colors"
              onClick={() => setOpenCategory(isOpen ? null : group)}
            >
              <h3 className="text-xl font-bold text-white">Expiry: {categoryLabels[group]}</h3>
              <div className="flex items-center gap-4">
                <Button size="lg" variant="outline" className="text-lg font-semibold" onClick={e => { e.stopPropagation(); downloadCSV(grouped[group], group); }}>
                  Download CSV
                </Button>
                <ChevronsUpDown className={`h-7 w-7 text-white transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
            {isOpen && (
              grouped[group].length === 0 ? (
                <Card><CardContent className="p-4 text-muted-foreground">No items in this category</CardContent></Card>
              ) : (
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto p-2">
                  {grouped[group].map((item) => {
                    const risk = calculateRiskLevel(item.expiry_date)
                    return (
                      <Collapsible key={item.id} open={openItem === item.id} onOpenChange={() => setOpenItem(openItem === item.id ? null : item.id)}>
                        <CollapsibleTrigger asChild>
                          <div className="flex justify-between items-center bg-background border rounded-lg p-3 cursor-pointer">
                            <span className="font-medium">{item.product_name}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(item.expiry_date), 'MMM dd, yyyy')}</span>
                            <ChevronsUpDown className="h-4 w-4 ml-2" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <Card className={`w-full mt-2 ${item.is_emergency ? 'border-destructive/50 bg-destructive/5' : ''} shadow-md`}>
                            <CardHeader>
                              <div className="flex justify-between items-start">
                                <div>
                                  <CardTitle className="text-lg font-bold">{item.product_name}</CardTitle>
                                  <div>
                                    <div>Branch: {item.branch}</div>
                                    <div>Expiry: {format(new Date(item.expiry_date), 'MMM dd, yyyy')} ({Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days away)</div>
                                    <div>Quantity: {item.quantity}</div>
                                    <div>Value: <span className="font-medium">USh {item.unit_price * item.quantity}</span></div>
                                    <div className="flex items-center gap-2">Risk: <Badge variant={risk.color === 'destructive' ? 'destructive' : risk.color === 'warning' ? 'secondary' : risk.color === 'secondary' ? 'secondary' : 'default'}>{risk.level}</Badge></div>
                                    <div>Assigned to: {item.assigned_to_name || item.assigned_to_email || "Unassigned"}</div>
                                  </div>
                                </div>
                                <div className="flex gap-2 items-center">
                                  {hasAdminAccess && (
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => deleteStockItem(item.id, item)}
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" disabled={item.quantity === 0} onClick={() => handleOpenAdjust(item)}>
                                  Adjust
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                </div>
              )
            )}
          </div>
        );
      })}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock Quantity</DialogTitle>
          </DialogHeader>
          {adjustItem && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold">Product:</div>
                <div>{adjustItem.product_name}</div>
                <div className="font-semibold mt-2">Branch:</div>
                <div>{adjustItem.branch}</div>
                <div className="font-semibold mt-2">Current Quantity:</div>
                <div className="text-lg font-bold">{adjustItem.quantity} units</div>
              </div>
              <div>
                <label htmlFor="adjust-qty" className="block text-sm font-medium mb-1">Quantity sold or moved</label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min={1}
                  max={adjustItem.quantity}
                  value={adjustQty}
                  onChange={e => setAdjustQty(Math.max(1, Math.min(adjustItem.quantity, parseInt(e.target.value) || 1)))}
                  className="w-24"
                  disabled={adjustLoading}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAdjustSubmit} disabled={adjustLoading || adjustQty < 1 || adjustQty > adjustItem.quantity} className="flex-1">
                  {adjustLoading ? 'Adjusting...' : 'Apply Adjustment'}
                </Button>
                <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} disabled={adjustLoading}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default StockList
