import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Plus } from 'lucide-react'

interface StockItem {
  id: string;
  product_name: string;
  branch_id: string;
  branch_name?: string;
  expiry_date: string;
  quantity: number;
  unit_price: number;
  status: string;
}

interface Branch {
  id: string
  name: string
  code: string
}

interface ManualProductDialogProps {
  stockItems: StockItem[]
  onStockUpdated: () => void
}

const ManualProductDialog = ({ stockItems, onStockUpdated }: ManualProductDialogProps) => {
  const [manualAddDialogOpen, setManualAddDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [manualProduct, setManualProduct] = useState({
    product_name: '',
    branch_id: '',
    expiry_date: '',
    quantity: 0,
    unit_price: 0
  })
  
  const { toast } = useToast()

  useEffect(() => {
    loadBranches()
  }, [])

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, code')
        .order('name')
      
      if (error) throw error
      setBranches(data || [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error loading branches:', message)
    }
  }

  const addManualProduct = async () => {
    if (!manualProduct.product_name || !manualProduct.branch_id || !manualProduct.expiry_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const selectedBranch = branches.find(b => b.id === manualProduct.branch_id)
      
      // Check if item already exists
      const existingItem = stockItems.find(item => 
        item.product_name.toLowerCase() === manualProduct.product_name.toLowerCase() &&
        item.branch_id === manualProduct.branch_id &&
        item.expiry_date === manualProduct.expiry_date
      )

      if (existingItem) {
        // Update existing item quantity
        const newQuantity = existingItem.quantity + manualProduct.quantity
        
        const { error: updateError } = await supabase
          .from('stock_items')
          .update({ 
            quantity: newQuantity,
            unit_price: manualProduct.unit_price || existingItem.unit_price
          })
          .eq('id', existingItem.id)

        if (updateError) throw updateError

        // Record the movement
        await supabase
          .from('stock_movement_history')
          .insert({
            stock_item_id: existingItem.id,
            movement_type: 'stock_in',
            quantity_moved: manualProduct.quantity,
            to_branch_id: manualProduct.branch_id,
            notes: `Manual addition: +${manualProduct.quantity} units`,
            moved_by: 'admin'
          })

        toast({
          title: "Success",
          description: `Updated existing item: ${manualProduct.product_name}`,
        })
      } else {
        // Add new item
        const { error: insertError } = await supabase
          .from('stock_items')
          .insert({
            product_name: manualProduct.product_name,
            branch_id: manualProduct.branch_id,
            expiry_date: manualProduct.expiry_date,
            quantity: manualProduct.quantity,
            unit_price: manualProduct.unit_price
          })

        if (insertError) throw insertError

        toast({
          title: "Success",
          description: `Added new product: ${manualProduct.product_name}`,
        })
      }

      // Reset form
      setManualProduct({
        product_name: '',
        branch_id: '',
        expiry_date: '',
        quantity: 0,
        unit_price: 0
      })
      setManualAddDialogOpen(false)
      onStockUpdated()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to add product",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setManualAddDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
        <Plus className="h-4 w-4 mr-2" />
        Add Manual Product
      </Button>

      {manualAddDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Add Manual Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="product_name">Product Name</Label>
                <Input
                  id="product_name"
                  value={manualProduct.product_name}
                  onChange={(e) => setManualProduct({...manualProduct, product_name: e.target.value})}
                  placeholder="Enter product name"
                />
              </div>

              <div>
                <Label htmlFor="branch">Branch</Label>
                <select
                  id="branch"
                  value={manualProduct.branch_id}
                  onChange={(e) => setManualProduct({...manualProduct, branch_id: e.target.value})}
                  className="w-full p-2 border rounded bg-background text-foreground"
                >
                  <option value="">Select Branch</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="expiry_date">Expiry Date</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={manualProduct.expiry_date}
                  onChange={(e) => setManualProduct({...manualProduct, expiry_date: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={manualProduct.quantity}
                  onChange={(e) => setManualProduct({...manualProduct, quantity: parseInt(e.target.value) || 0})}
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <Label htmlFor="unit_price">Unit Price (USh)</Label>
                <Input
                  id="unit_price"
                  type="number"
                  value={manualProduct.unit_price}
                  onChange={(e) => setManualProduct({...manualProduct, unit_price: parseFloat(e.target.value) || 0})}
                  placeholder="Enter unit price"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setManualAddDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={addManualProduct} 
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Adding...' : 'Add Product'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

export default ManualProductDialog
