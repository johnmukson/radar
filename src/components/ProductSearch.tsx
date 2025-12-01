import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Package, TrendingDown, TrendingUp, Calendar, DollarSign } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { format } from 'date-fns'
import { extractErrorMessage } from '@/lib/utils'

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

const ProductSearch = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager } = useBranch()
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [adjustQuantity, setAdjustQuantity] = useState(1)
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)
  const [showAdjustDialog, setShowAdjustDialog] = useState(false)

  const searchProducts = async (term: string) => {
    if (!term.trim()) {
      setSearchResults([])
      return
    }

    // Don't search if no branch selected - ALL users need a selected branch
    if (!selectedBranch) {
      toast({
        title: "No Branch Selected",
        description: "Please select a branch before searching.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from('stock_items')
        .select(`
          *,
          branches(name)
        `)
        .ilike('product_name', `%${term}%`)
      
      // ✅ ALWAYS filter by selected branch
      query = query.eq('branch_id', selectedBranch.id)
      
      const { data, error } = await query
        .order('product_name', { ascending: true })
        .limit(20)

      if (error) throw error

      // Calculate additional fields
      const itemsWithCalculations = (data || []).map(item => {
        const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        let riskLevel = 'very-low'
        if (daysToExpiry < 0) riskLevel = 'expired'
        else if (daysToExpiry <= 30) riskLevel = 'critical'      // 0-30 days
        else if (daysToExpiry <= 60) riskLevel = 'high'          // 31-60 days (Critical range)
        else if (daysToExpiry <= 90) riskLevel = 'medium-high'   // 61-90 days (High priority range)
        else if (daysToExpiry <= 120) riskLevel = 'medium-high'  // 91-120 days (Medium-high priority range)
        else if (daysToExpiry <= 180) riskLevel = 'medium'       // 121-180 days (Medium priority range)
        else if (daysToExpiry <= 365) riskLevel = 'low'          // 181-365 days (Low priority range)
        else riskLevel = 'very-low'                              // 365+ days (Very low priority range)

        return {
          ...item,
          branch_name: item.branches?.name || 'Unknown Branch',
          days_to_expiry: daysToExpiry,
          risk_level: riskLevel
        }
      })

      setSearchResults(itemsWithCalculations)
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to search products")
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
    const debounceTimer = setTimeout(() => {
      searchProducts(searchTerm)
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [searchTerm])

  const handleQuantityAdjustment = async () => {
    if (!selectedItem || adjustQuantity <= 0 || adjustQuantity > selectedItem.quantity) {
      toast({
        title: "Error",
        description: "Invalid quantity adjustment",
        variant: "destructive",
      })
      return
    }

    setAdjustLoading(true)
    try {
      console.log('Starting quantity adjustment for:', selectedItem)
      const newQuantity = selectedItem.quantity - adjustQuantity
      
      // Update stock item quantity
      const { error: updateError } = await supabase
        .from('stock_items')
        .update({ 
          quantity: newQuantity,
          status: newQuantity === 0 ? 'moved' : selectedItem.status,
          last_updated_at: new Date().toISOString(),
          last_updated_by: user?.id || null
        })
        .eq('id', selectedItem.id)

      if (updateError) {
        console.error('Update error:', updateError)
        throw updateError
      }

      console.log('Stock item updated successfully')

             // Record the movement in history
      const movementData = {
        stock_item_id: selectedItem.id,
        movement_type: newQuantity === 0 ? 'completion' : 'adjustment',
        quantity_moved: adjustQuantity,
        from_branch_id: selectedItem.branch_id,
        to_branch_id: selectedItem.branch_id, // Same branch for adjustments
        for_dispenser: user?.id || null, // The user making the adjustment
        moved_by: user?.id || null,
        notes: newQuantity === 0 
          ? `COMPLETED: ${adjustQuantity} units of ${selectedItem.product_name} - Item fully consumed`
          : `Adjusted ${adjustQuantity} units of ${selectedItem.product_name} - Remaining: ${newQuantity}`,
        movement_date: new Date().toISOString()
      }

      console.log('Movement data:', movementData)

      const { error: historyError } = await supabase
        .from('stock_movement_history')
        .insert(movementData)

      if (historyError) {
        console.error('History error:', historyError)
        throw historyError
      }

      console.log('Movement recorded successfully')

      // If this is a completion (quantity = 0), create or update a weekly task
      if (newQuantity === 0) {
        try {
          // Check if there's already a weekly task for this product
          const { data: existingTask, error: taskCheckError } = await supabase
            .from('weekly_tasks')
            .select('id, status')
            .eq('title', `Move ${selectedItem.product_name}`)
            .eq('assigned_to', user?.id)
            .eq('status', 'pending')
            .single()

          if (taskCheckError && taskCheckError.code !== 'PGRST116') {
            console.error('Error checking existing task:', taskCheckError)
          }

          if (existingTask) {
            // Update existing task to completed
            const { error: updateTaskError } = await supabase
              .from('weekly_tasks')
              .update({ 
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('id', existingTask.id)

            if (updateTaskError) {
              console.error('Error updating task to completed:', updateTaskError)
            } else {
              console.log('Weekly task marked as completed')
            }
          } else {
            // Create new completed task for this completion
            const { error: createTaskError } = await supabase
              .from('weekly_tasks')
              .insert({
                title: `Move ${selectedItem.product_name}`,
                description: `Completed: ${adjustQuantity} units of ${selectedItem.product_name} - Item fully consumed`,
                assigned_to: user?.id,
                assigned_by: user?.id,
                priority: 'medium',
                status: 'completed',
                whatsapp_sent: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })

            if (createTaskError) {
              console.error('Error creating completed task:', createTaskError)
            } else {
              console.log('New completed task created')
            }
          }
        } catch (taskError) {
          console.error('Error handling weekly task for completion:', taskError)
          // Don't throw error - movement was successful, task creation is bonus
        }
      }

      // Update local state to reflect the changes
      setSearchResults(prev => prev.map(item => 
        item.id === selectedItem.id 
          ? { 
              ...item, 
              quantity: newQuantity,
              status: newQuantity === 0 ? 'moved' : item.status
            }
          : item
      ))

      // Success message
      const successMessage = newQuantity === 0 
        ? `Item completed! ${adjustQuantity} units of ${selectedItem.product_name} have been fully consumed.`
        : `Quantity adjusted successfully! ${adjustQuantity} units removed from ${selectedItem.product_name}. Remaining: ${newQuantity}`;

      toast({
        title: newQuantity === 0 ? "Item Completed!" : "Quantity Adjusted",
        description: successMessage,
      });

      setShowAdjustDialog(false)
      setSelectedItem(null)
      setAdjustQuantity(1)
      setAdjustReason('')
    } catch (error: unknown) {
      console.error('Full error object:', error)
      
      // Use the utility function for better error message extraction
      const errorMessage = extractErrorMessage(error, "Failed to adjust quantity")
      
      // If it's a movement history error, still show success for the stock update
      if (errorMessage.toLowerCase().includes('stock_movement_history') || errorMessage.toLowerCase().includes('movement')) {
        toast({
          title: "Partial Success",
          description: `Stock updated but movement history failed. New quantity: ${selectedItem.quantity - adjustQuantity}`,
        })
        
        // Update local state even if movement history failed
        setSearchResults(prev => prev.map(item => 
          item.id === selectedItem.id 
            ? { ...item, quantity: selectedItem.quantity - adjustQuantity, status: (selectedItem.quantity - adjustQuantity) === 0 ? 'out_of_stock' : item.status }
            : item
        ))
        
        setShowAdjustDialog(false)
        setSelectedItem(null)
        setAdjustQuantity(1)
        setAdjustReason('')
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    } finally {
      setAdjustLoading(false)
    }
  }

  const openAdjustDialog = (item: StockItem) => {
    setSelectedItem(item)
    setAdjustQuantity(1)
    setAdjustReason('')
    setShowAdjustDialog(true)
  }

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Search className="h-5 w-5" />
            Product Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="search" className="text-slate-300">Search Products</Label>
              <Input
                id="search"
                placeholder="Enter product name to search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <p className="text-sm text-slate-400">
              Search for products by name. Results will show similar products and exact matches.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {!loading && searchResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            Found {searchResults.length} product{searchResults.length !== 1 ? 's' : ''}
          </h3>
          
          <div className="grid gap-4">
            {searchResults.map((item) => (
              <Card key={item.id} className="bg-slate-800 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-lg font-semibold text-white">
                          {item.product_name}
                        </h4>
                        <Badge 
                          variant={
                            item.status === 'moved' ? 'default' :
                            item.status === 'available' ? 'default' :
                            item.status === 'out_of_stock' ? 'destructive' :
                            item.status === 'low_stock' ? 'secondary' : 'outline'
                          }
                          className={
                            item.status === 'moved' ? 'bg-green-600 text-white' :
                            item.risk_level === 'expired' ? 'bg-red-600' :
                            item.risk_level === 'critical' ? 'bg-red-500' :      // 0-30 days
                            item.risk_level === 'high' ? 'bg-orange-500' :       // 31-60 days (Critical range)
                            item.risk_level === 'medium-high' ? 'bg-yellow-500' : // 61-120 days (High/Medium-high priority range)
                            item.risk_level === 'medium' ? 'bg-green-500' :      // 121-180 days (Medium priority range)
                            item.risk_level === 'low' ? 'bg-blue-500' :          // 181-365 days (Low priority range)
                            item.risk_level === 'very-low' ? 'bg-gray-500' :     // 365+ days (Very low priority range)
                            'bg-blue-500'                                        // 181+ days
                          }
                        >
                          {item.status === 'moved' ? 'Completed' : item.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-300">
                        <div className="flex items-center gap-1">
                          <Package className="h-4 w-4" />
                          <span>Qty: {item.quantity}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          <span>Price: ${item.unit_price}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Expiry: {format(new Date(item.expiry_date), 'MMM dd, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.days_to_expiry && item.days_to_expiry < 0 ? (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          )}
                          <span>
                            {item.days_to_expiry && item.days_to_expiry < 0 
                              ? `${Math.abs(item.days_to_expiry)} days expired`
                              : `${item.days_to_expiry} days left`
                            }
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 text-sm text-slate-400">
                        <div>Branch: {item.branch_name}</div>
                        {item.batch_number && <div>Batch: {item.batch_number}</div>}
                      </div>
                    </div>
                    
                                         <div className="flex items-center gap-2">
                                               <Button
                          onClick={() => openAdjustDialog(item)}
                          disabled={item.quantity <= 0}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Adjust Quantity
                        </Button>
                     </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!loading && searchTerm && searchResults.length === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="py-8 text-center text-slate-400">
            No products found matching "{searchTerm}"
          </CardContent>
        </Card>
      )}

      {/* Quantity Adjustment Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
                     <DialogHeader>
             <DialogTitle className="text-white">Adjust Quantity</DialogTitle>
           </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-white">Product:</div>
                <div className="text-slate-300">{selectedItem.product_name}</div>
                <div className="font-semibold text-white mt-2">Branch:</div>
                <div className="text-slate-300">{selectedItem.branch_name}</div>
                <div className="font-semibold text-white mt-2">Current Quantity:</div>
                <div className="text-lg font-bold text-white">{selectedItem.quantity} units</div>
                <div className="font-semibold text-white mt-2">Unit Price:</div>
                <div className="text-slate-300">${selectedItem.unit_price}</div>
              </div>
              
                             <div>
                 <Label htmlFor="adjust-qty" className="text-slate-300">Quantity to adjust</Label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min={1}
                  max={selectedItem.quantity}
                  value={adjustQuantity}
                  onChange={e => setAdjustQuantity(Math.max(1, Math.min(selectedItem.quantity, parseInt(e.target.value) || 1)))}
                  className="w-24 bg-slate-700 border-slate-600 text-white"
                  disabled={adjustLoading}
                />
                <div className="text-sm text-slate-400 mt-1">
                  Total: ${(adjustQuantity * selectedItem.unit_price).toFixed(2)}
                </div>
              </div>
              
              <div>
                <Label htmlFor="reason" className="text-slate-300">Reason (optional)</Label>
                                 <Input
                   id="reason"
                   value={adjustReason}
                   onChange={(e) => setAdjustReason(e.target.value)}
                   placeholder="Enter reason for adjustment..."
                   className="bg-slate-700 border-slate-600 text-white"
                 />
              </div>
              
              <div className="flex gap-2 pt-2">
                                 <Button 
                   onClick={handleQuantityAdjustment} 
                   disabled={adjustLoading || adjustQuantity < 1 || adjustQuantity > selectedItem.quantity} 
                   className="flex-1 bg-green-600 hover:bg-green-700"
                 >
                   {adjustLoading ? 'Processing...' : 'Confirm Adjustment'}
                 </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowAdjustDialog(false)} 
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
    </div>
  )
}

export default ProductSearch 