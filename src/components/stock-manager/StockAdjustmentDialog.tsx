import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Box, AlertTriangle } from 'lucide-react'

interface StockItem {
  id: string
  product_name: string
  branch_id: string
  branch_name?: string
  expiry_date: string
  quantity: number
  unit_price: number
  status: string
}

interface Dispenser {
  id: string;
  dispenser: string;
  email: string | null;
}

interface StockAdjustmentDialogProps {
  stockItems: StockItem[];
  onStockUpdated: () => void;
}

const getRiskLevel = (expiryDate: string) => {
  const today = new Date()
  const expiry = new Date(expiryDate)
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntilExpiry < 0) return { level: 'expired', color: 'destructive' }
  if (daysUntilExpiry <= 30) return { level: 'critical', color: 'destructive' }      // 0-30 days
  if (daysUntilExpiry <= 60) return { level: 'high', color: 'warning' }             // 31-60 days
  if (daysUntilExpiry <= 180) return { level: 'low', color: 'success' }             // 61-180 days
  return { level: 'very-low', color: 'default' }                                    // 181+ days
}

const StockAdjustmentDialog = ({ stockItems, onStockUpdated }: StockAdjustmentDialogProps) => {
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [quantityAdjustment, setQuantityAdjustment] = useState(0)
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { toast } = useToast()

  const adjustQuantity = async () => {
    if (!selectedItem || quantityAdjustment === 0) return
    setLoading(true)
    try {
      const newQuantity = Math.max(0, selectedItem.quantity + quantityAdjustment)
      const updateObj: { quantity: number; status?: string } = { quantity: newQuantity }
      if (newQuantity === 0) updateObj.status = 'completed'
      
      const { error: updateError } = await supabase
        .from('stock_items')
        .update(updateObj)
        .eq('id', selectedItem.id)
      if (updateError) throw updateError
      
      const movementType = newQuantity === 0 ? 'completion' : (quantityAdjustment > 0 ? 'stock_in' : 'stock_out')
      const notes = newQuantity === 0 
        ? `COMPLETED: ${selectedItem.product_name} - Item fully consumed`
        : (adjustmentReason || `Manual quantity adjustment: ${quantityAdjustment > 0 ? '+' : ''}${quantityAdjustment}`)
      
      await supabase
        .from('stock_movement_history')
        .insert({
          stock_item_id: selectedItem.id,
          movement_type: movementType,
          quantity_moved: Math.abs(quantityAdjustment),
          to_branch_id: selectedItem.branch_id,
          notes: notes,
          moved_by: 'admin'
        })

      // If quantity reached zero, update any associated weekly_tasks to completed
      if (newQuantity === 0) {
        await supabase
          .from('weekly_tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('product_id', selectedItem.id)
          .eq('status', 'pending')
      }
      
      toast({
        title: "Success",
        description: `Quantity adjusted for ${selectedItem.product_name}`,
      })
      setDialogOpen(false)
      setSelectedItem(null)
      setQuantityAdjustment(0)
      setAdjustmentReason('')
      onStockUpdated()
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to adjust quantity"
      
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

  const openAdjustmentDialog = (item: StockItem) => {
    setSelectedItem(item)
    setQuantityAdjustment(0)
    setAdjustmentReason('')
    setDialogOpen(true)
  }

  if (!stockItems || stockItems.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Quick Stock Adjustments</h3>
          <p className="text-sm text-muted-foreground mb-4">
            No stock items available for adjustment
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Quick Stock Adjustments</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Select a stock item to adjust its quantity
          </p>
        </div>
        
        <div className="grid gap-2 max-h-60 overflow-y-auto">
          {stockItems.map((item) => {
            const risk = getRiskLevel(item.expiry_date)
            const daysAway = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => openAdjustmentDialog(item)}
              >
                <div className="flex-1">
                  <div className="font-medium">{item.product_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.branch_name} • {item.quantity} units • Expires in {daysAway} days
                  </div>
                </div>
                <Badge variant={risk.color as "default" | "secondary" | "destructive" | "outline"}>{risk.level}</Badge>
              </div>
            )
          })}
        </div>
      </div>

      {selectedItem && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adjust Stock Quantity</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Item Details */}
              <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg">
                <div>
                  <div className="font-semibold">Product:</div>
                  <div>{selectedItem.product_name}</div>
                  <div className="font-semibold mt-2">Branch:</div>
                  <div>{selectedItem.branch_name}</div>
                  <div className="font-semibold mt-2">Current Quantity:</div>
                  <div className="text-lg font-bold">{selectedItem.quantity} units</div>
                </div>
                <div>
                  <div className="font-semibold">Unit Price:</div>
                  <div>USh {selectedItem.unit_price}</div>
                  <div className="font-semibold mt-2">Expiry Date:</div>
                  <div>{format(new Date(selectedItem.expiry_date), 'MMM dd, yyyy')}</div>
                  <div className="font-semibold mt-2">Status:</div>
                  <Badge variant="outline">{selectedItem.status}</Badge>
                </div>
              </div>

              {/* Adjustment Input */}
              <div>
                <Label htmlFor="adjustment">Quantity Adjustment</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setQuantityAdjustment(q => q - 1)}
                    disabled={loading}
                  >
                    -
                  </Button>
                  <Input
                    id="adjustment"
                    type="number"
                    value={quantityAdjustment}
                    onChange={(e) => setQuantityAdjustment(parseInt(e.target.value) || 0)}
                    className="w-20 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setQuantityAdjustment(q => q + 1)}
                    disabled={loading}
                  >
                    +
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  New quantity will be: {Math.max(0, selectedItem.quantity + quantityAdjustment)} units
                </div>
              </div>

              {/* Reason */}
              <div>
                <Label htmlFor="reason">Reason for adjustment</Label>
                <Textarea
                  id="reason"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Enter reason for quantity adjustment..."
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={adjustQuantity}
                  disabled={loading || quantityAdjustment === 0}
                  className="flex-1"
                >
                  {loading ? 'Adjusting...' : 'Apply Adjustment'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

export default StockAdjustmentDialog
