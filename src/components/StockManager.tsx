import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import ManualProductDialog from './stock-manager/ManualProductDialog'
import StockFileUpload from './stock-manager/StockFileUpload'
import StockUpdatesPreview from './stock-manager/StockUpdatesPreview'
import StockAdjustmentDialog from './stock-manager/StockAdjustmentDialog'
import StockItemsList from './stock-manager/StockItemsList'

interface StockItem {
  id: string
  product_name: string
  branch_id: string
  branch_name?: string
  expiry_date: string
  quantity: number
  unit_price: number
  status: string
  is_high_value?: boolean
  value?: number
}

interface StockUpdate {
  product_name: string
  branch_id: string
  branch_name?: string
  expiry_date: string
  quantity: number
  unit_price: number
  action: 'update' | 'add'
  existing_id?: string
}

const StockManager = () => {
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [pendingUpdates, setPendingUpdates] = useState<StockUpdate[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const fetchStockItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stock_items')
        .select(`
          id,
          product_name,
          branch_id,
          expiry_date,
          quantity,
          unit_price,
          status,
          branches(name)
        `)
        .order('product_name')

      if (error) throw error

      // Transform the data to match the expected interface
      const transformedData = data?.map(item => ({
        ...item,
        branch_name: item.branches?.name || 'Unknown Branch'
      })) || []

      setStockItems(transformedData)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to fetch stock items",
        variant: "destructive",
      })
    }
  }, [toast])

  useEffect(() => {
    fetchStockItems()
  }, [fetchStockItems])

  const applyStockUpdates = async () => {
    setLoading(true)
    try {
      for (const update of pendingUpdates) {
        if (update.action === 'update' && update.existing_id) {
          // Update existing item quantity
          const { error: updateError } = await supabase
            .from('stock_items')
            .update({ quantity: update.quantity })
            .eq('id', update.existing_id)

          if (updateError) throw updateError

          // Record the movement
          await supabase
            .from('stock_movement_history')
            .insert({
              stock_item_id: update.existing_id,
              movement_type: 'stock_adjustment',
              quantity_moved: update.quantity - stockItems.find(i => i.id === update.existing_id)!.quantity,
              to_branch_id: update.branch_id,
              notes: `Stock adjusted via file upload`,
              moved_by: 'admin'
            })
        } else {
          // Add new item
          const { error: insertError } = await supabase
            .from('stock_items')
            .insert({
              product_name: update.product_name,
              branch_id: update.branch_id,
              expiry_date: update.expiry_date,
              quantity: update.quantity,
              unit_price: update.unit_price
            })

          if (insertError) throw insertError
        }
      }

      toast({
        title: "Success",
        description: `${pendingUpdates.length} stock updates applied successfully`,
      })

      setPendingUpdates([])
      setShowPreview(false)
      fetchStockItems()

      const form = document.getElementById('stock-file-form') as HTMLFormElement
      form?.reset()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to apply stock updates",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStockUpdated = () => {
    fetchStockItems()
  }

  const handleStockDeleted = () => {
    fetchStockItems()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Stock Management</h1>
          <p className="text-muted-foreground">Manage inventory and stock levels</p>
        </div>
        <div className="flex gap-2">
          <ManualProductDialog 
            stockItems={stockItems} 
            onStockUpdated={handleStockUpdated} 
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload Stock File</CardTitle>
          </CardHeader>
          <CardContent>
            <StockFileUpload
              onUpdatesReady={setPendingUpdates}
              onShowPreview={setShowPreview}
              existingItems={stockItems}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <StockAdjustmentDialog 
              stockItems={stockItems}
              onStockUpdated={handleStockUpdated}
            />
          </CardContent>
        </Card>
      </div>

      {showPreview && pendingUpdates.length > 0 && (
        <StockUpdatesPreview
          updates={pendingUpdates}
          onApply={applyStockUpdates}
          onCancel={() => {
            setShowPreview(false)
            setPendingUpdates([])
          }}
          loading={loading}
        />
      )}

      <StockItemsList 
        stockItems={stockItems} 
        onAdjustQuantity={handleStockUpdated}
        onStockDeleted={handleStockDeleted}
      />
    </div>
  )
}

export default StockManager
