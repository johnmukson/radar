import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUserRole } from '@/hooks/useUserRole'
import { useStockAdjuster } from '@/contexts/StockAdjusterContext'
import { useBranch } from '@/contexts/BranchContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Crown, Download, Edit, ChevronsUpDown } from 'lucide-react'
import { formatUGX } from '@/utils/currency'
import { format, parseISO, startOfMonth, isBefore } from 'date-fns'
import type { StockItem } from '@/contexts/StockAdjusterContext'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

// Extend the StockItem type for our specific needs in this component
interface HighValueItem extends StockItem {
  branches: { name: string } | null;
  days_to_expiry: number | null;
  risk_level: string | null;
  value: number | null;
}

const HighValueItems = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager } = useBranch()
  const [items, setItems] = useState<HighValueItem[]>([])
  const [loading, setLoading] = useState(true)
  const { userRole } = useUserRole()
  const { openAdjustModal } = useStockAdjuster()
  const [showAll, setShowAll] = useState(false)
  const { toast } = useToast()

  // Adjust quantity states
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<HighValueItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(1)
  const [adjustLoading, setAdjustLoading] = useState(false)

  useEffect(() => {
    const fetchHighValueItems = async () => {
      // Don't fetch if no branch selected - ALL users need a selected branch
      if (!selectedBranch) {
        setItems([])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Get all stock items and filter for high value (unit_price * quantity > 100000)
        let query = supabase
          .from('stock_items')
          .select(`
            *,
            branches(name)
          `)
        
        // ✅ ALWAYS filter by selected branch
        query = query.eq('branch_id', selectedBranch.id)
        
        const { data, error } = await query
          .order('expiry_date', { ascending: true })

        if (error) {
          console.error('Error fetching high value items:', error)
          setItems([])
        } else {
          // Filter for high value items and calculate additional fields
          // Also filter out items with quantity 0 (completed/out of stock items)
          const highValueItems = data
            .filter(item => (item.quantity || 0) > 0) // Exclude items with quantity 0
            .filter(item => (item.unit_price * item.quantity) > 100000) // High value threshold
            .map(item => {
              const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
              const value = item.unit_price * item.quantity
              
              // Calculate risk level based on days to expiry
              let riskLevel = 'very-low'
              if (daysToExpiry < 0) riskLevel = 'expired'
              else if (daysToExpiry <= 30) riskLevel = 'critical'      // 0-30 days
              else if (daysToExpiry <= 60) riskLevel = 'high'          // 31-60 days
              else if (daysToExpiry <= 180) riskLevel = 'low'          // 61-180 days
              
              return {
                ...item,
                branches: item.branches,
                days_to_expiry: daysToExpiry,
                risk_level: riskLevel,
                value: value
              }
            }) as HighValueItem[]
          
          setItems(highValueItems)
        }
      } catch (error) {
        console.error('Error in fetchHighValueItems:', error)
        setItems([])
      }
      setLoading(false)
    }

    fetchHighValueItems()
  }, [selectedBranch]) // ✅ Re-fetch when branch changes

  const groupedItems = useMemo(() => {
    const groups: { [key: string]: HighValueItem[] } = {}
    const currentMonthStart = startOfMonth(new Date());

    items.forEach(item => {
      const expiryDate = parseISO(item.expiry_date);
      if (isBefore(expiryDate, currentMonthStart)) {
        return; // Skip items from past months
      }
      
      const monthKey = format(expiryDate, 'MMMM yyyy');
      if (!groups[monthKey]) {
        groups[monthKey] = []
      }
      groups[monthKey].push(item)
    })
    return groups
  }, [items])

  const sortedMonthKeys = useMemo(() => {
    return Object.keys(groupedItems).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA.getTime() - dateB.getTime();
    });
  }, [groupedItems]);
  
  const visibleMonths = showAll ? sortedMonthKeys : sortedMonthKeys.slice(0, 2);

  const downloadCSV = () => {
    const headers = ['Product Name', 'Branch', 'Quantity', 'Unit Price', 'Total Value', 'Expiry Date', 'Days to Expire', 'Risk Level'];
    const csvContent = [
      headers.join(','),
      ...items.map(item => [
        `"${item.product_name}"`,
        `"${item.branches?.name || 'N/A'}"`,
        item.quantity,
        item.unit_price,
        item.value,
        format(parseISO(item.expiry_date), 'yyyy-MM-dd'),
        item.days_to_expiry,
        `"${item.risk_level}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.href) {
      URL.revokeObjectURL(link.href);
    }
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', 'high_value_items.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleOpenAdjust = (item: HighValueItem) => {
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
      if (newQty === 0) updateObj.status = 'out_of_stock'
      
      const { error: updateError } = await supabase
        .from('stock_items')
        .update(updateObj)
        .eq('id', adjustItem.id)
      if (updateError) throw updateError
      
      // Record movement
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.id) {
        throw new Error('User not authenticated')
      }
      
      const movementType = newQty === 0 ? 'completion' : 'adjustment'
      const notes = newQty === 0 
        ? `COMPLETED: ${adjustItem.product_name} - Item fully consumed from high value items`
        : `Quantity adjusted from high value items. Product: ${adjustItem.product_name}`
      
      const movementData = {
        stock_item_id: adjustItem.id,
        movement_type: movementType,
        quantity_moved: adjustQty,
        from_branch_id: adjustItem.branch_id || null,
        to_branch_id: null, // No transfer, just adjustment
        for_dispenser: null, // Not assigned to specific dispenser
        moved_by: user.id,
        movement_date: new Date().toISOString(),
        notes: notes
      }

      console.log('Attempting to insert movement data:', movementData)
      const { error: historyError } = await supabase
        .from('stock_movement_history')
        .insert(movementData)

      if (historyError) {
        console.error('Movement history error:', historyError)
        toast({ 
          title: 'Partial Success', 
          description: `Stock updated but movement history failed. Error: ${historyError.message}. New quantity: ${newQty}` 
        })
      } else {
        toast({ title: 'Success', description: `Quantity adjusted and movement recorded. New quantity: ${newQty}` })
      }

      // If quantity reached zero, update any associated weekly_tasks to completed
      if (newQty === 0) {
        await supabase
          .from('weekly_tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('product_id', adjustItem.id)
          .eq('status', 'pending')
      }

      // Update local state
      setItems(prev => prev.map(item => 
        item.id === adjustItem.id 
          ? { ...item, quantity: newQty, value: newQty * item.unit_price }
          : item
      ))

      setAdjustDialogOpen(false)
      setAdjustItem(null)
      setAdjustQty(1)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({ title: 'Error', description: message || 'Failed to adjust quantity', variant: 'destructive' })
    } finally {
      setAdjustLoading(false)
    }
  }
  
  const canAdjustQuantity = userRole !== 'regional_manager';

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crown /> High Value Items</CardTitle>
          <CardDescription>Loading high-priority stock items...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-3xl font-bold"><Crown /> High Value Items</CardTitle>
          <CardDescription>A prioritized list of high-value stock items nearing expiry.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
           {sortedMonthKeys.length > 2 && (
            <Button onClick={() => setShowAll(!showAll)} variant="outline" size="sm">
              {showAll ? 'Show Less' : 'Show All'}
            </Button>
          )}
          <Button onClick={downloadCSV} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleMonths.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">
            No high-value items expiring in future months.
          </div>
        ) : (
          visibleMonths.map(month => (
            <Collapsible key={month} defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <div className="flex justify-between items-center bg-muted p-3 rounded-lg cursor-pointer">
                  <h3 className="font-semibold text-xl">{month}</h3>
                  <ChevronsUpDown className="h-4 w-4" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Days to Expire</TableHead>
                      {canAdjustQuantity && <TableHead className="text-center">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedItems[month].map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell>{item.branches?.name || 'N/A'}</TableCell>
                        <TableCell>{item.risk_level || 'N/A'}</TableCell>
                        <TableCell className="text-right">{formatUGX(item.value || 0)}</TableCell>
                        <TableCell className="text-right">{item.days_to_expiry || 'N/A'}</TableCell>
                        {canAdjustQuantity && (
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenAdjust(item)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </CardContent>

      {/* Adjust Quantity Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Adjust Quantity</DialogTitle>
          </DialogHeader>
          {adjustItem && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-white">Product:</div>
                <div className="text-slate-300">{adjustItem.product_name}</div>
                <div className="font-semibold text-white mt-2">Branch:</div>
                <div className="text-slate-300">{adjustItem.branches?.name || 'N/A'}</div>
                <div className="font-semibold text-white mt-2">Current Quantity:</div>
                <div className="text-lg font-bold text-white">{adjustItem.quantity} units</div>
                <div className="font-semibold text-white mt-2">Total Value:</div>
                <div className="text-lg font-bold text-white">{formatUGX(adjustItem.value || 0)}</div>
              </div>
              <div>
                <Label htmlFor="adjust-qty" className="text-slate-300">Quantity to adjust</Label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min={1}
                  max={adjustItem.quantity}
                  value={adjustQty}
                  onChange={e => setAdjustQty(Math.max(1, Math.min(adjustItem.quantity, parseInt(e.target.value) || 1)))}
                  className="w-24 bg-slate-700 border-slate-600 text-white"
                  disabled={adjustLoading}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleAdjustSubmit} 
                  disabled={adjustLoading || adjustQty < 1 || adjustQty > adjustItem.quantity} 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {adjustLoading ? 'Processing...' : 'Confirm Adjustment'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setAdjustDialogOpen(false)} 
                  disabled={adjustLoading}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default HighValueItems 