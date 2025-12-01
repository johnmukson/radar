import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { format } from 'date-fns'
import { Plus, Minus, Edit, Trash2 } from 'lucide-react'

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

interface StockItemsListProps {
  stockItems: StockItem[]
  onAdjustQuantity: () => void
  onStockDeleted: () => void
}

const StockItemsList = ({ stockItems, onAdjustQuantity, onStockDeleted }: StockItemsListProps) => {
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  const handleDeleteStockItem = async (itemId: string) => {
    setIsDeleting(true)
    setDeletingItemId(itemId)
    
    try {
      // Check user permissions first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Check if user has admin role
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'system_admin', 'regional_manager'])

      if (roleError) {
        console.error('Role check error:', roleError)
      }

      if (!userRoles || userRoles.length === 0) {
        throw new Error('You do not have permission to delete stock items. Only admins, system admins, and regional managers can perform this action.')
      }
      // First, record the deletion in movement history
      const item = stockItems.find(i => i.id === itemId)
      if (item) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase
          .from('stock_movement_history')
          .insert({
            stock_item_id: itemId,
            movement_type: 'deletion',
            quantity_moved: -item.quantity, // Negative to indicate removal
            from_branch_id: item.branch_id,
            to_branch_id: null,
            for_dispenser: null,
            moved_by: user?.id || null,
            movement_date: new Date().toISOString(),
            notes: `Stock item deleted: ${item.product_name}`
          })
      }

      // Delete the stock item from the database
      const { error } = await supabase
        .from('stock_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      toast({
        title: "Success",
        description: "Stock item deleted successfully",
      })

      // Refresh the stock list
      onStockDeleted()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to delete stock item",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeletingItemId(null)
    }
  }

  const handleBulkDelete = async (itemIds: string[]) => {
    setIsDeleting(true)
    
    try {
      // Check user permissions first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Check if user has admin role
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'system_admin', 'regional_manager'])

      if (roleError) {
        console.error('Role check error:', roleError)
      }

      if (!userRoles || userRoles.length === 0) {
        throw new Error('You do not have permission to delete stock items. Only admins, system admins, and regional managers can perform this action.')
      }
      let deletedCount = 0
      let failedCount = 0

      for (const itemId of itemIds) {
        try {
          const item = stockItems.find(i => i.id === itemId)
          if (item) {
            // Record deletion in movement history
            const { data: { user } } = await supabase.auth.getUser()
            await supabase
              .from('stock_movement_history')
              .insert({
                stock_item_id: itemId,
                movement_type: 'deletion',
                quantity_moved: -item.quantity,
                from_branch_id: item.branch_id,
                to_branch_id: null,
                for_dispenser: null,
                moved_by: user?.id || null,
                movement_date: new Date().toISOString(),
                notes: `Stock item deleted: ${item.product_name}`
              })
          }

          // Delete the stock item
          const { error } = await supabase
            .from('stock_items')
            .delete()
            .eq('id', itemId)

          if (error) {
            failedCount++
            console.error(`Failed to delete item ${itemId}:`, error)
            console.error('Error details:', error)
          } else {
            deletedCount++
          }
        } catch (error) {
          failedCount++
          console.error(`Error deleting item ${itemId}:`, error)
        }
      }

      if (deletedCount > 0) {
        toast({
          title: "Bulk Delete Complete",
          description: `Successfully deleted ${deletedCount} items${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        })
        onStockDeleted()
      } else {
        toast({
          title: "Error",
          description: "Failed to delete any items",
          variant: "destructive",
        })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to perform bulk delete",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Current Stock - Quick Adjustments</CardTitle>
          {stockItems.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                  title="Delete all stock items"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Bulk Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-600">⚠️ Bulk Delete Stock Items</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="text-red-600 font-medium">⚠️ WARNING: This will permanently delete ALL {stockItems.length} stock items from the database.</span>
                    <br /><br />
                    This action cannot be undone and will permanently remove all stock items from the system.
                    <br /><br />
                    <strong>Are you absolutely sure you want to continue?</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleBulkDelete(stockItems.map(item => item.id))}
                    className="bg-red-600 text-white hover:bg-red-700 border-red-600 hover:border-red-700"
                  >
                    {isDeleting ? 'Deleting All Items...' : 'Delete All Items'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex overflow-x-auto gap-4 pb-2">
          {stockItems.map((item) => (
            <div
              key={item.id}
              className="min-w-[260px] max-w-[280px] flex-shrink-0 bg-background border rounded-lg p-4 flex flex-col justify-between shadow-md"
            >
              <div>
                <h3 className="font-semibold text-base mb-1 truncate">{item.product_name}</h3>
                <p className="text-xs text-muted-foreground mb-1">{item.branch_name || 'Unknown Branch'}</p>
                <p className="text-xs text-muted-foreground mb-1">
                  Expires: {format(new Date(item.expiry_date), 'MMM dd, yyyy')}
                </p>
                <p className="text-xs text-muted-foreground mb-1">
                  Quantity: <span className="font-medium">{item.quantity}</span>
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Value: <span className="font-medium">USh {item.unit_price * item.quantity}</span>
                </p>
                {item.is_high_value && (
                  <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mb-2">
                    High Value Item
                  </div>
                )}
                <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {item.status}
                </div>
              </div>
              
              <div className="flex gap-1 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Handle quantity adjustment
                    onAdjustQuantity()
                  }}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Adjust
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 min-w-[40px]"
                      disabled={isDeleting && deletingItemId === item.id}
                      title="Delete this stock item"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-red-600">⚠️ Delete Stock Item</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete <strong>"{item.product_name}"</strong>? 
                        <br /><br />
                        <span className="text-red-600 font-medium">⚠️ This action cannot be undone and will permanently remove this item from the database.</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteStockItem(item.id)}
                        className="bg-red-600 text-white hover:bg-red-700 border-red-600 hover:border-red-700"
                      >
                        {isDeleting && deletingItemId === item.id ? 'Deleting...' : 'Delete Item'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
        
        {stockItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No stock items found.</p>
            <p className="text-sm">Upload a stock file or add items manually to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default StockItemsList
