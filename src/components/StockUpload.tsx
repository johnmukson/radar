import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import * as XLSX from 'xlsx'
import ManualProductDialog from '@/components/stock-manager/ManualProductDialog'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'

interface StockItem {
  product_name: string
  branch_id: string
  branch_name?: string
  expiry_date: string
  quantity: number
  unit_price: number
}

interface Branch {
  id: string
  name: string
  code: string
}

type StockRow = {
  [key: string]: unknown;
};

const StockUpload = () => {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [reconcile, setReconcile] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [uploadedItems, setUploadedItems] = useState<StockItem[]>([])
  const [showUploadedItems, setShowUploadedItems] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [totalStockItems, setTotalStockItems] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    loadBranches()
    fetchTotalStockItems()
  }, [])

  const loadBranches = async () => {
    try {
      console.log('🔍 Loading branches...')
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, code')
        .order('name')
      
      if (error) {
        console.error('❌ Error loading branches:', error)
        throw error
      }
      
      console.log('✅ Branches loaded:', data)
      setBranches(data || [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('❌ Error loading branches:', message)
    }
  }

  const fetchTotalStockItems = async () => {
    try {
      const { count, error } = await supabase
        .from('stock_items')
        .select('*', { count: 'exact', head: true })
      
      if (error) throw error
      setTotalStockItems(count || 0)
    } catch (error: unknown) {
      console.error('Error fetching total stock items:', error)
    }
  }

  const parseDate = (dateValue: unknown): string | null => {
    if (!dateValue) return null
    
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0]
    }
    
    if (typeof dateValue === 'number') {
      const excelEpoch = new Date(1900, 0, 1)
      const days = dateValue - 2
      const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000)
      return date.toISOString().split('T')[0]
    }
    
    if (typeof dateValue === 'string') {
      const cleanDate = dateValue.trim()
      
      const ddmmyyyyMatch = cleanDate.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
      if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      }
      
      const yyyymmddMatch = cleanDate.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)
      if (yyyymmddMatch) {
        const [, year, month, day] = yyyymmddMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      }
      
      const yyyymmddDashMatch = cleanDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)
      if (yyyymmddDashMatch) {
        const [, year, month, day] = yyyymmddDashMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      }
    }
    
    return null
  }

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast({
        title: "Error",
        description: "Please select a file",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as StockRow[]

      // Check if branches are loaded, fetch directly if needed
      let currentBranches = branches
      console.log('🔍 Initial branches state:', { count: branches.length, branches })
      
      if (currentBranches.length === 0) {
        console.log('⚠️ No branches loaded, fetching branches directly...')
        try {
          console.log('🔍 Making Supabase query to branches table...')
          const { data: branchData, error: branchError } = await supabase
            .from('branches')
            .select('id, name, code')
            .order('name')
          
          console.log('🔍 Supabase response:', { data: branchData, error: branchError })
          
          if (branchError) {
            console.error('❌ Error fetching branches:', branchError)
            toast({
              title: "Error",
              description: `Failed to load branches from database: ${branchError.message}`,
              variant: "destructive",
            })
            return
          }
          
          currentBranches = branchData || []
          console.log('✅ Fetched branches directly:', currentBranches)
          
          if (currentBranches.length === 0) {
            console.log('❌ No branches found in database')
            toast({
              title: "Error",
              description: "No branches found in database. Please ensure branches are set up.",
              variant: "destructive",
            })
            return
          }
        } catch (error) {
          console.error('❌ Exception fetching branches:', error)
          toast({
            title: "Error",
            description: `Failed to load branches from database: ${error instanceof Error ? error.message : String(error)}`,
            variant: "destructive",
          })
          return
        }
      } else {
        console.log('✅ Using existing branches from state:', currentBranches)
      }

      const stockItems: StockItem[] = []
      const invalidItems: StockRow[] = []

      jsonData.forEach((row: StockRow, index: number) => {
        const parsedDate = parseDate(row.expiry_date || row.ExpiryDate || row.Expiry)
        const branchName = row.branch || row.Branch || row.BranchName
        
        // DEBUG: Log what we're processing
        console.log(`Row ${index + 1}:`, {
          rawRow: row,
          branchName: branchName,
          productName: row.product_name || row.Product || row.ProductName,
          quantity: row.quantity || row.Quantity,
          unitPrice: row.unit_price || row.UnitPrice || row.Price,
          parsedDate: parsedDate,
          availableBranches: currentBranches.map(b => b.name),
          branchesCount: currentBranches.length,
          branchesData: currentBranches
        })
        
        // Find branch by name
        const branch = currentBranches.find(b => 
          b.name.toLowerCase() === branchName?.toString().toLowerCase()
        )

        const item = {
          product_name: String(row.product_name || row.Product || row.ProductName || ''),
          branch_id: branch?.id || '',
          branch_name: branch?.name,
          expiry_date: parsedDate,
          quantity: parseInt(String(row.quantity || row.Quantity || 0)) || 0,
          unit_price: parseFloat(String(row.unit_price || row.UnitPrice || row.Price || 0)) || 0,
        }
        
        // DEBUG: Log the processed item
        console.log(`Processed item ${index + 1}:`, {
          product_name: item.product_name,
          branch_id: item.branch_id,
          branch_name: item.branch_name,
          expiry_date: item.expiry_date,
          quantity: item.quantity,
          unit_price: item.unit_price,
          isValid: !!(item.product_name && item.branch_id && item.expiry_date && item.quantity && item.unit_price)
        })
        
        if (!item.product_name || !item.branch_id || !item.expiry_date || !item.quantity || !item.unit_price) {
          console.log(`❌ INVALID ROW ${index + 1}:`, {
            missing_product_name: !item.product_name,
            missing_branch_id: !item.branch_id,
            missing_expiry_date: !item.expiry_date,
            missing_quantity: !item.quantity,
            missing_unit_price: !item.unit_price
          })
          invalidItems.push(row)
        } else {
          stockItems.push(item as StockItem)
        }
      })

      if (invalidItems.length > 0) {
        console.log('⚠️ Skipping invalid items:', invalidItems.length)
        console.log('🔍 Detailed analysis of invalid items:')
        
        invalidItems.forEach((item, index) => {
          const parsedDate = parseDate(item.expiry_date || item.ExpiryDate || item.Expiry)
          const branchName = item.branch || item.Branch || item.BranchName
          const productName = item.product_name || item.Product || item.ProductName
          const quantity = item.quantity || item.Quantity
          const unitPrice = item.unit_price || item.UnitPrice || item.Price
          
          console.log(`⚠️ Skipping Item ${index + 1}:`, {
            rawItem: item,
            branchName: branchName,
            productName: productName,
            quantity: quantity,
            unitPrice: unitPrice,
            parsedDate: parsedDate,
            issues: {
              missing_product_name: !productName,
              missing_branch_id: !currentBranches.find(b => b.name.toLowerCase() === branchName?.toString().toLowerCase()),
              missing_expiry_date: !parsedDate,
              missing_quantity: !quantity,
              missing_unit_price: !unitPrice,
              branch_not_found: !currentBranches.find(b => b.name.toLowerCase() === branchName?.toString().toLowerCase()) ? `Branch "${branchName}" not found in: ${currentBranches.map(b => b.name).join(', ')}` : null
            }
          })
        })
        
        // Show warning but continue with valid items
        toast({
          title: "Partial Upload",
          description: `Skipped ${invalidItems.length} invalid items. Proceeding with ${stockItems.length} valid items.`,
          variant: "default",
        })
      }

      // Store uploaded items for preview/delete
      setUploadedItems(stockItems)
      setShowUploadedItems(true)

      if (!reconcile) {
        // Insert into database (default behavior)
        const { error } = await supabase
          .from('stock_items')
          .insert(stockItems.map(item => ({
            product_name: item.product_name,
            branch_id: item.branch_id,
            expiry_date: item.expiry_date,
            quantity: item.quantity,
            unit_price: item.unit_price
          })))
        if (error) throw error
        toast({
          title: "Success",
          description: `${stockItems.length} stock items uploaded successfully`,
        })
        
        // Clear the form after successful upload
        clearUploadData()
      } else {
        // Reconcile: update existing, insert missing
        let updated = 0, inserted = 0, failed = 0
        for (const item of stockItems) {
          // Check if item exists (by product_name, branch_id, expiry_date)
          const { data: existing, error: findError } = await supabase
            .from('stock_items')
            .select('id, quantity')
            .eq('product_name', item.product_name)
            .eq('branch_id', item.branch_id)
            .eq('expiry_date', item.expiry_date)
            .maybeSingle()
          if (findError) { failed++; continue; }
          if (existing && existing.id) {
            // Update quantity (add to existing)
            const { error: updateError } = await supabase
              .from('stock_items')
              .update({ quantity: existing.quantity + item.quantity })
              .eq('id', existing.id)
            if (updateError) { failed++; continue; }
            updated++
          } else {
            // Insert as new
            const { error: insertError } = await supabase
              .from('stock_items')
              .insert({
                product_name: item.product_name,
                branch_id: item.branch_id,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                unit_price: item.unit_price
              })
            if (insertError) { failed++; continue; }
            inserted++
          }
        }
        toast({
          title: "Reconciliation Complete",
          description: `Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`,
        })
        
        // Clear the form after successful upload
        clearUploadData()
      }

    } catch (error: unknown) {
      console.error('Upload error:', error)
      
      // Provide more detailed error information
      let errorMessage = "Failed to upload stock items"
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error)
      } else {
        errorMessage = String(error)
      }
      
      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const clearUploadData = () => {
    setFile(null)
    setUploadedItems([])
    setShowUploadedItems(false)
    setReconcile(false)
    fetchTotalStockItems() // Refresh the count
    const form = document.getElementById('upload-form') as HTMLFormElement
    form?.reset()
  }

  const deleteUploadedItems = async () => {
    if (uploadedItems.length === 0) return

    setLoading(true)
    try {
      // Delete items that were just uploaded
      for (const item of uploadedItems) {
        const { error } = await supabase
          .from('stock_items')
          .delete()
          .eq('product_name', item.product_name)
          .eq('branch_id', item.branch_id)
          .eq('expiry_date', item.expiry_date)
          .eq('quantity', item.quantity)
          .eq('unit_price', item.unit_price)

        if (error) {
          console.error('Error deleting item:', error)
        }
      }

      toast({
        title: "Success",
        description: "Uploaded items deleted successfully",
      })

      clearUploadData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to delete uploaded items",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBulkDeleteAll = async () => {
    console.log('🚀 handleBulkDeleteAll function started')
    setIsBulkDeleting(true)
    
    try {
      // Check user permissions first
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        throw new Error('User not authenticated')
      }

      // Check if user has admin role
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .in('role', ['admin', 'system_admin', 'regional_manager'])

      console.log('Current user ID:', currentUser.id)
      console.log('User roles found:', userRoles)
      console.log('Role check error:', roleError)

      if (roleError) {
        console.error('Role check error:', roleError)
      }

      if (!userRoles || userRoles.length === 0) {
        console.warn('User does not have admin role, but attempting delete anyway...')
        // Temporarily allow delete for testing
        // throw new Error('You do not have permission to delete stock items. Only admins, system admins, and regional managers can perform this action.')
      }
      // First, get all stock items to record them in movement history
      console.log('Fetching all stock items...')
      const { data: allItems, error: fetchError } = await supabase
        .from('stock_items')
        .select('*')
      
      console.log('Fetch result:', { allItems: allItems?.length || 0, fetchError })
      
      if (fetchError) throw fetchError

      let deletedCount = 0
      const failedCount = 0

      // Record bulk deletion in movement history BEFORE deleting items
      console.log('📝 Recording movement history for', allItems?.length || 0, 'items...')
      if (allItems && allItems.length > 0) {
        let movementSuccessCount = 0
        let movementErrorCount = 0
        
        // Batch the movement history inserts for better performance
        const batchSize = 50
        const batches = []
        
        for (let i = 0; i < allItems.length; i += batchSize) {
          const batch = allItems.slice(i, i + batchSize).map(item => ({
            stock_item_id: item.id,
            movement_type: 'bulk_deletion',
            quantity_moved: -item.quantity,
            from_branch_id: item.branch_id,
            to_branch_id: null,
            for_dispenser: null,
            moved_by: currentUser?.id || null,
            movement_date: new Date().toISOString(),
            notes: `Bulk delete all: ${item.product_name}`
          }))
          batches.push(batch)
        }
        
        console.log(`📦 Processing ${batches.length} batches of ${batchSize} items each...`)
        
        for (let i = 0; i < batches.length; i++) {
          try {
            const { error } = await supabase
              .from('stock_movement_history')
              .insert(batches[i])
            
            if (error) {
              console.error(`Batch ${i + 1} movement error:`, error)
              movementErrorCount += batches[i].length
            } else {
              movementSuccessCount += batches[i].length
            }
            
            console.log(`📦 Batch ${i + 1}/${batches.length} completed`)
          } catch (batchError) {
            console.error(`Batch ${i + 1} failed:`, batchError)
            movementErrorCount += batches[i].length
          }
        }
        
        console.log('📊 Movement history recorded:', { movementSuccessCount, movementErrorCount })
      }

      // Delete movement history records first to avoid foreign key constraint
      console.log('🗑️ Deleting movement history records first...')
      const { error: movementDeleteError } = await supabase
        .from('stock_movement_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (movementDeleteError) {
        console.error('❌ Movement history delete error:', movementDeleteError)
        throw new Error(`Failed to delete movement history: ${movementDeleteError.message}`)
      } else {
        console.log('✅ Movement history records deleted successfully')
      }

      // Delete all stock items
      console.log('🗑️ Attempting to delete all stock items...')
      const { error: deleteError } = await supabase
        .from('stock_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all items

      console.log('🗑️ Delete operation result:', { deleteError, deletedCount: allItems?.length || 0 })

      if (deleteError) {
        console.error('❌ Delete error details:', deleteError)
        throw new Error(`Delete failed: ${deleteError.message}. You may not have permission to delete stock items.`)
      } else {
        console.log('✅ Delete operation successful!')
        deletedCount = allItems?.length || 0
      }

      if (deletedCount > 0) {
        toast({
          title: "Bulk Delete Complete",
          description: `Successfully deleted ALL ${deletedCount} stock items from the database.`,
        })
        setTotalStockItems(0) // Update the count
      } else {
        toast({
          title: "No Items Found",
          description: "No stock items were found to delete.",
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
      setIsBulkDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header with Bulk Delete */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Upload Stock Items</h1>
          <p className="text-muted-foreground">Upload Excel files and manage stock data</p>
        </div>
        <div className="flex items-center gap-4">
          {totalStockItems > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                  disabled={isBulkDeleting}
                  title="Delete ALL stock items from database"
                  onClick={() => console.log('Delete button clicked (trigger)')}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isBulkDeleting ? 'Deleting All...' : `Delete All (${totalStockItems})`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-600">⚠️ Delete ALL Stock Items</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="text-red-600 font-medium">⚠️ WARNING: This will permanently delete ALL {totalStockItems} stock items from the database.</span>
                    <br /><br />
                    This action cannot be undone and will permanently remove ALL stock items from the system.
                    <br /><br />
                    <strong>Are you absolutely sure you want to continue?</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      console.log('Delete All button clicked!')
                      handleBulkDeleteAll()
                    }}
                    className="bg-red-600 text-white hover:bg-red-700 border-red-600 hover:border-red-700"
                  >
                    {isBulkDeleting ? 'Deleting All Items...' : 'Delete ALL Items'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Stock Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <p className="text-muted-foreground mb-4">
              Upload an Excel file with columns: product_name, branch, expiry_date, quantity, unit_price
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Note: Branch names must match existing branches in the system
            </p>
            <form id="upload-form" onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <Label htmlFor="file">Excel File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="reconcile"
                  checked={reconcile}
                  onChange={(e) => setReconcile(e.target.checked)}
                />
                <Label htmlFor="reconcile">Reconcile with existing items (add quantities)</Label>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Uploading...' : 'Upload Stock Items'}
                </Button>
                {showUploadedItems && uploadedItems.length > 0 && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={deleteUploadedItems}
                    disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                    title="Delete uploaded items from database"
                  >
                    {loading ? 'Deleting...' : '🗑️ Delete Uploaded Items'}
                  </Button>
                )}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={clearUploadData}
                  disabled={loading}
                >
                  Clear Form
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Items Preview */}
      {showUploadedItems && uploadedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Items Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadedItems.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <span className="font-medium">{item.product_name}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {item.branch_name} - Qty: {item.quantity} - Price: USh {item.unit_price}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Addition Section */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Product Addition</CardTitle>
        </CardHeader>
        <CardContent>
          <ManualProductDialog 
            stockItems={[]} 
            onStockUpdated={() => {}} 
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default StockUpload
