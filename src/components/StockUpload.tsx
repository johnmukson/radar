import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Package, Upload, Download, Plus, Search, Filter, BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, Clock, DollarSign, Building, User, Calendar, Trash2, Edit, Eye, EyeOff, FileText, CheckSquare, XSquare, AlertCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { extractErrorMessage } from '@/lib/utils'
import * as XLSX from 'xlsx'
import ManualProductDialog from '@/components/stock-manager/ManualProductDialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useBranch } from '@/contexts/BranchContext'
import UploadPreviewDialog from '@/components/upload/UploadPreviewDialog'
import UploadProgressDialog, { UploadProgressItem } from '@/components/upload/UploadProgressDialog'
import PostUploadSummaryDialog, { UploadedItem } from '@/components/upload/PostUploadSummaryDialog'
import { validateStockItem, StockItemForValidation } from '@/utils/uploadValidation'

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
  const { selectedBranch, isSystemAdmin } = useBranch()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [reconcile, setReconcile] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [uploadedItems, setUploadedItems] = useState<StockItem[]>([])
  const [showUploadedItems, setShowUploadedItems] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [totalStockItems, setTotalStockItems] = useState(0)
  const [branchColumnDetected, setBranchColumnDetected] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewItems, setPreviewItems] = useState<StockItemForValidation[]>([])
  const [dbDuplicates, setDbDuplicates] = useState<Map<string, StockItemForValidation[]>>(new Map()) // ✅ Database duplicates
  const [showProgress, setShowProgress] = useState(false) // ✅ Upload progress dialog
  const [uploadProgress, setUploadProgress] = useState<UploadProgressItem[]>([]) // ✅ Progress items
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0) // ✅ Current item being uploaded
  const [uploadSpeed, setUploadSpeed] = useState(0) // ✅ Items per second
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0) // ✅ Seconds remaining
  const [isCancelling, setIsCancelling] = useState(false) // ✅ Cancellation flag
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null) // ✅ Upload start time
  const cancelRef = useRef(false) // ✅ Ref for immediate cancellation check
  const [showSummary, setShowSummary] = useState(false) // ✅ Post-upload summary dialog
  const [uploadedItemsSummary, setUploadedItemsSummary] = useState<UploadedItem[]>([]) // ✅ Successfully uploaded items
  const [errorItemsSummary, setErrorItemsSummary] = useState<UploadedItem[]>([]) // ✅ Failed items
  const [duplicateItemsSummary, setDuplicateItemsSummary] = useState<UploadedItem[]>([]) // ✅ Duplicate items
  const [isRollingBack, setIsRollingBack] = useState(false) // ✅ Rollback in progress
  const [uploadMode, setUploadMode] = useState<'insert' | 'reconcile'>('insert') // ✅ Upload mode
  const [reconcileStats, setReconcileStats] = useState<{ inserted: number; updated: number; failed: number } | undefined>() // ✅ Reconcile statistics
  const [selectedTemplate, setSelectedTemplate] = useState<string>('') // ✅ Selected import template
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]) // ✅ Available templates
  const { toast } = useToast()

  useEffect(() => {
    loadBranches()
  }, [])

  // ✅ Re-fetch stock count when branch changes
  useEffect(() => {
    fetchTotalStockItems()
  }, [selectedBranch, isSystemAdmin])

  // ✅ Load templates when branch changes
  useEffect(() => {
    if (selectedBranch) {
      loadTemplates()
    }
  }, [selectedBranch])

  const loadTemplates = async () => {
    if (!selectedBranch) return

    try {
      // Get default template for this branch
      const { data: defaultTemplate, error: defaultError } = await supabase.rpc('get_default_template', {
        p_branch_id: selectedBranch.id,
        p_template_type: 'stock_items'
      })

      if (defaultError && defaultError.code !== 'P0001') { // P0001 = function returned null
        console.error('Error fetching default template:', defaultError)
      }

      // Get all available templates for this branch
      const { data: templates, error: templatesError } = await supabase
        .from('import_templates')
        .select('id, name, is_default, is_shared')
        .eq('template_type', 'stock_items')
        .or(`branch_id.eq.${selectedBranch.id},is_shared.eq.true`)
        .order('is_default', { ascending: false })
        .order('name')

      if (templatesError) {
        console.error('Error loading templates:', templatesError)
        return
      }

      setAvailableTemplates(templates || [])

      // Auto-select default template if available
      if (defaultTemplate) {
        setSelectedTemplate(defaultTemplate.id)
      } else if (templates && templates.length > 0) {
        // Select first template if no default
        setSelectedTemplate(templates[0].id)
      }
    } catch (error) {
      console.error('Error loading templates:', error)
    }
  }

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
      const errorMessage = extractErrorMessage(error, "Failed to load branches")
      console.error('❌ Error loading branches:', errorMessage)
    }
  }

  // ✅ Branch-scoped: Only count items for selected branch (except system admin)
  const fetchTotalStockItems = async () => {
    try {
      // If no branch selected and not system admin, don't fetch
      if (!selectedBranch && !isSystemAdmin) {
        setTotalStockItems(0)
        return
      }

      let query = supabase
        .from('stock_items')
        .select('*', { count: 'exact', head: true })

      // ✅ Filter by branch if not system admin
      if (!isSystemAdmin && selectedBranch) {
        query = query.eq('branch_id', selectedBranch.id)
      }

      const { count, error } = await query
      
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
          const errorMessage = extractErrorMessage(error, "Failed to load branches from database")
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          })
          return
        }
      } else {
        console.log('✅ Using existing branches from state:', currentBranches)
      }

      const stockItems: StockItem[] = []

      // ✅ TEMPLATE INTEGRATION: Get template column mappings if template selected
      let columnMapping: Record<string, string> = {}
      let defaultValues: Record<string, any> = {}
      
      if (selectedTemplate) {
        try {
          const { data: template, error: templateError } = await supabase
            .from('import_templates')
            .select('column_mapping, default_values')
            .eq('id', selectedTemplate)
            .single()

          if (!templateError && template) {
            columnMapping = template.column_mapping || {}
            defaultValues = template.default_values || {}
          }
        } catch (error) {
          console.error('Error loading template:', error)
          // Continue without template if error
        }
      }

      // Helper function to get value from row using template mapping or fallback
      const getMappedValue = (row: StockRow, dbField: string, fallbackKeys: string[]): any => {
        // First try template mapping
        if (columnMapping[dbField]) {
          const mappedColumn = columnMapping[dbField]
          if (row[mappedColumn] !== undefined && row[mappedColumn] !== '') {
            return row[mappedColumn]
          }
        }

        // Then try fallback keys
        for (const key of fallbackKeys) {
          if (row[key] !== undefined && row[key] !== '') {
            return row[key]
          }
        }

        // Finally try default value from template
        if (defaultValues[dbField] !== undefined) {
          return defaultValues[dbField]
        }

        return null
      }

      // Check if branch column exists in Excel (to show warning)
      const hasBranchColumn = jsonData.some(row => 
        row.branch || row.Branch || row.BranchName
      )
      setBranchColumnDetected(hasBranchColumn)

      // If branch column detected, show warning
      if (hasBranchColumn) {
        toast({
          title: "Branch Column Detected",
          description: "Branch column in file will be ignored. All items will be assigned to your selected branch.",
          variant: "default",
        })
      }

      // Validate selected branch
      if (!selectedBranch) {
        toast({
          title: "No Branch Selected",
          description: "Please select a branch before uploading. Redirecting to branch selection...",
          variant: "destructive",
        })
        setTimeout(() => {
          window.location.href = '/branch-selection'
        }, 2000)
        setLoading(false)
        return
      }

      jsonData.forEach((row: StockRow, index: number) => {
        // ✅ Use template mapping or fallback to standard column names
        const productName = getMappedValue(row, 'product_name', ['product_name', 'Product', 'ProductName', 'name', 'Name']) || ''
        const expiryDateRaw = getMappedValue(row, 'expiry_date', ['expiry_date', 'ExpiryDate', 'Expiry', 'expiry', 'date', 'Date'])
        const quantityRaw = getMappedValue(row, 'quantity', ['quantity', 'Quantity', 'qty', 'Qty'])
        const unitPriceRaw = getMappedValue(row, 'unit_price', ['unit_price', 'UnitPrice', 'Price', 'price', 'cost', 'Cost'])
        
        const parsedDate = parseDate(expiryDateRaw)
        
        // AUTO-ASSIGN: Use selected branch from context (ignore Excel branch column)
        const item = {
          product_name: String(productName),
          branch_id: selectedBranch.id, // ✅ Always use selected branch
          branch_name: selectedBranch.name, // ✅ Always use selected branch name
          expiry_date: parsedDate,
          quantity: parseInt(String(quantityRaw || 0)) || 0,
          unit_price: parseFloat(String(unitPriceRaw || 0)) || 0,
        }
        
        // Add all items to stockItems for validation (validation will filter invalid ones)
        stockItems.push(item as StockItem)
      })

      // ✅ TEMPLATE VALIDATION: Validate against template if selected
      if (selectedTemplate && stockItems.length > 0) {
        try {
          const { data: validationResult, error: validationError } = await supabase.rpc('validate_import_template', {
            p_template_id: selectedTemplate,
            p_file_data: jsonData.slice(0, 10) // Validate first 10 rows as sample
          })

          if (!validationError && validationResult) {
            if (!validationResult.is_valid && validationResult.errors) {
              toast({
                title: 'Template Validation Warning',
                description: `Template validation found issues: ${validationResult.errors.join(', ')}. Proceeding with upload...`,
                variant: 'default'
              })
            }
          }
        } catch (error) {
          console.error('Error validating template:', error)
          // Continue with upload even if validation fails
        }
      }

      // Note: Invalid items will be filtered out in the preview dialog
      // All items are passed to preview for validation

      // Convert to validation format
      const itemsForValidation: StockItemForValidation[] = stockItems.map(item => ({
        product_name: item.product_name,
        branch_id: item.branch_id,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))

      // ✅ DATABASE DUPLICATE DETECTION: Check for duplicates in database
      console.log('🔍 Checking for database duplicates...')
      const { checkDuplicatesInDatabase } = await import('@/utils/uploadValidation')
      const dbDuplicates = await checkDuplicatesInDatabase(itemsForValidation, supabase)
      
      if (dbDuplicates.size > 0) {
        const duplicateCount = Array.from(dbDuplicates.values()).flat().length
        toast({
          title: "Database Duplicates Detected",
          description: `${duplicateCount} item(s) already exist in the database. They will be highlighted in the preview.`,
          variant: "default",
        })
      }

      // Store database duplicates in state to pass to preview dialog
      setDbDuplicates(dbDuplicates)

      // Show preview dialog before upload (with database duplicate info)
      setPreviewItems(itemsForValidation)
      setShowPreview(true)
      setLoading(false)

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
      setLoading(false)
    }
  }

  const handlePreviewConfirm = async (validItems: StockItemForValidation[]) => {
    if (validItems.length === 0) {
      toast({
        title: "No Valid Items",
        description: "No valid items to upload. Please check your data.",
        variant: "destructive",
      })
      setShowPreview(false)
      return
    }

    // ✅ Initialize progress tracking
    const progressItems: UploadProgressItem[] = validItems.map((item, index) => ({
      index,
      product_name: item.product_name,
      status: 'pending' as const
    }))
    setUploadProgress(progressItems)
    setCurrentUploadIndex(0)
    setUploadSpeed(0)
    setEstimatedTimeRemaining(0)
    setIsCancelling(false)
    cancelRef.current = false // ✅ Reset cancellation ref
    setUploadStartTime(Date.now())
    setShowProgress(true)
    setShowPreview(false)
    setLoading(true)

    try {
      // Store uploaded items for preview/delete
      const stockItemsForUpload = validItems.map(item => ({
        product_name: item.product_name,
        branch_id: item.branch_id,
        branch_name: selectedBranch?.name,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))
      setUploadedItems(stockItemsForUpload as StockItem[])
      setShowUploadedItems(true)

      if (!reconcile) {
        // ✅ UPLOAD WITH PROGRESS TRACKING: Insert items one by one
        setUploadMode('insert')
        let successCount = 0
        let errorCount = 0
        const startTime = Date.now()
        const uploaded: UploadedItem[] = []
        const errors: UploadedItem[] = []

        for (let i = 0; i < validItems.length; i++) {
          // Check for cancellation using ref (immediate check)
          if (cancelRef.current) {
            setUploadProgress(prev => prev.map((item, idx) => 
              idx >= i && item.status !== 'success' 
                ? { ...item, status: 'error' as const, error: 'Upload cancelled' } 
                : item
            ))
            break
          }

          const item = validItems[i]
          
          // Update current item to uploading
          setUploadProgress(prev => prev.map((p, idx) => 
            idx === i ? { ...p, status: 'uploading' as const } : p
          ))
          setCurrentUploadIndex(i + 1)

          try {
            const { data, error } = await supabase
              .from('stock_items')
              .insert({
                product_name: item.product_name,
                branch_id: item.branch_id,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                unit_price: item.unit_price
              })
              .select()
              .single()

            if (error) {
              throw error
            }

            // Update to success
            setUploadProgress(prev => prev.map((p, idx) => 
              idx === i ? { ...p, status: 'success' as const } : p
            ))
            
            // ✅ Track successfully uploaded item with ID
            uploaded.push({
              id: data?.id,
              product_name: item.product_name,
              branch_id: item.branch_id,
              branch_name: selectedBranch?.name,
              expiry_date: item.expiry_date,
              quantity: item.quantity,
              unit_price: item.unit_price,
              status: 'success'
            })
            successCount++

            // Calculate upload speed and estimated time
            const elapsed = (Date.now() - startTime) / 1000 // seconds
            const speed = (i + 1) / elapsed // items per second
            setUploadSpeed(speed)
            
            const remaining = validItems.length - (i + 1)
            const estimated = remaining / speed
            setEstimatedTimeRemaining(Math.ceil(estimated))

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed'
            setUploadProgress(prev => prev.map((p, idx) => 
              idx === i ? { ...p, status: 'error' as const, error: errorMessage } : p
            ))
            
            // ✅ Track failed item
            errors.push({
              product_name: item.product_name,
              branch_id: item.branch_id,
              branch_name: selectedBranch?.name,
              expiry_date: item.expiry_date,
              quantity: item.quantity,
              unit_price: item.unit_price,
              status: 'error',
              error: errorMessage
            })
            errorCount++
          }

          // Small delay to show progress (optional, can be removed for faster uploads)
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        // ✅ Store summary data
        setUploadedItemsSummary(uploaded)
        setErrorItemsSummary(errors)
        setDuplicateItemsSummary([]) // No duplicates in insert mode (already filtered in preview)

        // Close progress dialog
        setShowProgress(false)
        setLoading(false)

        if (cancelRef.current) {
          toast({
            title: "Upload Cancelled",
            description: `${successCount} items uploaded before cancellation.`,
            variant: "default",
          })
          // Show summary even if cancelled
          if (successCount > 0 || errorCount > 0) {
            setShowSummary(true)
          }
        } else {
          // ✅ Show post-upload summary
          setShowSummary(true)
          
          if (errorCount > 0) {
            toast({
              title: "Upload Completed with Errors",
              description: `${successCount} items uploaded successfully, ${errorCount} failed.`,
              variant: errorCount === validItems.length ? "destructive" : "default",
            })
          } else {
            toast({
              title: "Success",
              description: `${validItems.length} stock items uploaded successfully`,
            })
          }
        }
        
        // Clear the form after successful upload (only if no errors and not cancelled)
        if (errorCount === 0 && !cancelRef.current) {
          // Don't clear immediately - let user see summary first
          // clearUploadData()
        }
      } else {
        // ✅ RECONCILE WITH PROGRESS TRACKING: Update existing, insert missing
        setUploadMode('reconcile')
        let updated = 0, inserted = 0, failed = 0
        const startTime = Date.now()
        const uploaded: UploadedItem[] = []
        const errors: UploadedItem[] = []
        const duplicates: UploadedItem[] = []

        for (let i = 0; i < validItems.length; i++) {
          // Check for cancellation using ref (immediate check)
          if (cancelRef.current) {
            setUploadProgress(prev => prev.map((item, idx) => 
              idx >= i && item.status !== 'success' 
                ? { ...item, status: 'error' as const, error: 'Upload cancelled' } 
                : item
            ))
            break
          }

          const item = validItems[i]
          
          // Update current item to uploading
          setUploadProgress(prev => prev.map((p, idx) => 
            idx === i ? { ...p, status: 'uploading' as const } : p
          ))
          setCurrentUploadIndex(i + 1)

          try {
            // Check if item exists (by product_name, branch_id, expiry_date)
            const { data: existing, error: findError } = await supabase
              .from('stock_items')
              .select('id, quantity')
              .eq('product_name', item.product_name)
              .eq('branch_id', item.branch_id)
              .eq('expiry_date', item.expiry_date)
              .maybeSingle()
            
            if (findError) {
              throw findError
            }

            if (existing && existing.id) {
              // Update quantity (add to existing)
              const { error: updateError } = await supabase
                .from('stock_items')
                .update({ quantity: existing.quantity + item.quantity })
                .eq('id', existing.id)
              
              if (updateError) {
                throw updateError
              }
              
              setUploadProgress(prev => prev.map((p, idx) => 
                idx === i ? { ...p, status: 'success' as const } : p
              ))
              
              // ✅ Track updated item
              uploaded.push({
                id: existing.id,
                product_name: item.product_name,
                branch_id: item.branch_id,
                branch_name: selectedBranch?.name,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                unit_price: item.unit_price,
                status: 'success'
              })
              updated++
            } else {
              // Insert as new
              const { data: newItem, error: insertError } = await supabase
                .from('stock_items')
                .insert({
                  product_name: item.product_name,
                  branch_id: item.branch_id,
                  expiry_date: item.expiry_date,
                  quantity: item.quantity,
                  unit_price: item.unit_price
                })
                .select()
                .single()
              
              if (insertError) {
                throw insertError
              }
              
              setUploadProgress(prev => prev.map((p, idx) => 
                idx === i ? { ...p, status: 'success' as const } : p
              ))
              
              // ✅ Track inserted item
              uploaded.push({
                id: newItem?.id,
                product_name: item.product_name,
                branch_id: item.branch_id,
                branch_name: selectedBranch?.name,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                unit_price: item.unit_price,
                status: 'success'
              })
              inserted++
            }

            // Calculate upload speed and estimated time
            const elapsed = (Date.now() - startTime) / 1000
            const speed = (i + 1) / elapsed
            setUploadSpeed(speed)
            
            const remaining = validItems.length - (i + 1)
            const estimated = remaining / speed
            setEstimatedTimeRemaining(Math.ceil(estimated))

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed'
            setUploadProgress(prev => prev.map((p, idx) => 
              idx === i ? { ...p, status: 'error' as const, error: errorMessage } : p
            ))
            
            // ✅ Track failed item
            errors.push({
              product_name: item.product_name,
              branch_id: item.branch_id,
              branch_name: selectedBranch?.name,
              expiry_date: item.expiry_date,
              quantity: item.quantity,
              unit_price: item.unit_price,
              status: 'error',
              error: errorMessage
            })
            failed++
          }

          // Small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        // ✅ Store summary data
        setUploadedItemsSummary(uploaded)
        setErrorItemsSummary(errors)
        setDuplicateItemsSummary(duplicates)
        setReconcileStats({ inserted, updated, failed })

        // Close progress dialog
        setShowProgress(false)
        setLoading(false)

        if (cancelRef.current) {
          toast({
            title: "Upload Cancelled",
            description: `${inserted + updated} items processed before cancellation.`,
            variant: "default",
          })
          // Show summary even if cancelled
          if (inserted + updated > 0 || failed > 0) {
            setShowSummary(true)
          }
        } else {
          // ✅ Show post-upload summary
          setShowSummary(true)
          toast({
            title: "Reconciliation Complete",
            description: `Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`,
          })
        }
        
        // Clear the form after successful upload (only if no errors)
        if (failed === 0 && !cancelRef.current) {
          // Don't clear immediately - let user see summary first
          // clearUploadData()
        }
      }
    } catch (error: unknown) {
      console.error('Upload error:', error)
      
      // Update all pending items to error
      setUploadProgress(prev => prev.map(item => 
        item.status === 'pending' || item.status === 'uploading' 
          ? { ...item, status: 'error' as const, error: error instanceof Error ? error.message : 'Upload failed' }
          : item
      ))
      
      let errorMessage = "Failed to upload stock items"
      if (error instanceof Error) {
        errorMessage = error.message
      }
      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
      })
      setShowProgress(false)
      setLoading(false)
    }
  }

  // ✅ Handle upload cancellation
  const handleCancelUpload = () => {
    cancelRef.current = true // ✅ Set ref immediately for instant cancellation
    setIsCancelling(true)
    toast({
      title: "Upload Cancellation",
      description: "Upload is being cancelled. Please wait...",
      variant: "default",
    })
  }

  // ✅ Handle rollback (delete uploaded items)
  const handleRollbackUpload = async () => {
    if (uploadedItemsSummary.length === 0) {
      toast({
        title: "No Items to Rollback",
        description: "No successfully uploaded items to rollback.",
        variant: "default",
      })
      return
    }

    setIsRollingBack(true)
    try {
      let deletedCount = 0
      let failedCount = 0

      // Delete items by ID if available, otherwise by matching fields
      for (const item of uploadedItemsSummary) {
        try {
          let query = supabase.from('stock_items').delete()

          if (item.id) {
            // Delete by ID (most reliable)
            query = query.eq('id', item.id)
          } else {
            // Delete by matching fields (fallback)
            query = query
              .eq('product_name', item.product_name)
              .eq('branch_id', item.branch_id)
              .eq('expiry_date', item.expiry_date)
              .eq('quantity', item.quantity)
              .eq('unit_price', item.unit_price)
          }

          const { error } = await query

          if (error) {
            console.error('Error deleting item:', error)
            failedCount++
          } else {
            deletedCount++
          }
        } catch (error) {
          console.error('Error deleting item:', error)
          failedCount++
        }
      }

      if (deletedCount > 0) {
        toast({
          title: "Rollback Complete",
          description: `${deletedCount} item(s) deleted successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}.`,
          variant: failedCount > 0 ? "default" : "default",
        })
        
        // Clear summary and refresh
        setUploadedItemsSummary([])
        setErrorItemsSummary([])
        setDuplicateItemsSummary([])
        setReconcileStats(undefined)
        setShowSummary(false)
        fetchTotalStockItems()
        clearUploadData()
        
        // Also clear progress state
        setUploadProgress([])
        setCurrentUploadIndex(0)
        setUploadSpeed(0)
        setEstimatedTimeRemaining(0)
        setIsCancelling(false)
        cancelRef.current = false
      } else {
        toast({
          title: "Rollback Failed",
          description: "Failed to delete uploaded items.",
          variant: "destructive",
        })
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Rollback failed'
      toast({
        title: "Rollback Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsRollingBack(false)
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
      const errorMessage = extractErrorMessage(error, "Failed to delete uploaded items")
      toast({
        title: "Error",
        description: errorMessage,
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

      // ✅ Check if user has admin role
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .in('role', ['admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'branch_manager', 'inventory_assistant'])

      if (roleError) {
        throw new Error(`Failed to check user permissions: ${roleError.message}`)
      }

      if (!userRoles || userRoles.length === 0) {
        throw new Error('You do not have permission to delete stock items. Only admins and managers can perform this action.')
      }

      // ✅ Branch-scoped deletion: System admin can delete all, others only their branch
      let query = supabase
        .from('stock_items')
        .select('*')

      // If not system admin, filter by selected branch
      if (!isSystemAdmin && selectedBranch) {
        query = query.eq('branch_id', selectedBranch.id)
      } else if (!isSystemAdmin && !selectedBranch) {
        throw new Error('Please select a branch to delete stock items.')
      }

      console.log('Fetching stock items...', isSystemAdmin ? '(all branches)' : `(branch: ${selectedBranch?.name})`)
      const { data: allItems, error: fetchError } = await query
      
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

      // ✅ Delete movement history records first (branch-scoped for non-system admins)
      console.log('🗑️ Deleting movement history records first...')
      let movementDeleteQuery = supabase
        .from('stock_movement_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      // If not system admin, filter by selected branch
      if (!isSystemAdmin && selectedBranch) {
        movementDeleteQuery = movementDeleteQuery.eq('from_branch_id', selectedBranch.id)
      }

      const { error: movementDeleteError } = await movementDeleteQuery

      if (movementDeleteError) {
        console.error('❌ Movement history delete error:', movementDeleteError)
        throw new Error(`Failed to delete movement history: ${movementDeleteError.message}`)
      } else {
        console.log('✅ Movement history records deleted successfully')
      }

      // ✅ Delete stock items (branch-scoped for non-system admins)
      console.log('🗑️ Attempting to delete stock items...', isSystemAdmin ? '(all branches)' : `(branch: ${selectedBranch?.name})`)
      let deleteQuery = supabase
        .from('stock_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      // If not system admin, filter by selected branch
      if (!isSystemAdmin && selectedBranch) {
        deleteQuery = deleteQuery.eq('branch_id', selectedBranch.id)
      }

      const { error: deleteError } = await deleteQuery

      console.log('🗑️ Delete operation result:', { deleteError, deletedCount: allItems?.length || 0 })

      if (deleteError) {
        console.error('❌ Delete error details:', deleteError)
        throw new Error(`Delete failed: ${deleteError.message}. You may not have permission to delete stock items.`)
      } else {
        console.log('✅ Delete operation successful!')
        deletedCount = allItems?.length || 0
      }

      // ✅ Delete weekly tasks (branch-scoped for non-system admins)
      console.log('🗑️ Attempting to delete weekly tasks...', isSystemAdmin ? '(all branches)' : `(branch: ${selectedBranch?.name})`)
      let weeklyTasksQuery = supabase
        .from('weekly_tasks')
        .select('*')

      // If not system admin, filter by selected branch
      if (!isSystemAdmin && selectedBranch) {
        weeklyTasksQuery = weeklyTasksQuery.eq('branch_id', selectedBranch.id)
      }

      const { data: weeklyTasks, error: weeklyTasksError } = await weeklyTasksQuery

      if (weeklyTasksError) {
        console.error('❌ Weekly tasks fetch error:', weeklyTasksError)
        throw new Error(`Failed to fetch weekly tasks: ${weeklyTasksError.message}`)
      }

      let weeklyTasksDeleteQuery = supabase
        .from('weekly_tasks')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      // If not system admin, filter by selected branch
      if (!isSystemAdmin && selectedBranch) {
        weeklyTasksDeleteQuery = weeklyTasksDeleteQuery.eq('branch_id', selectedBranch.id)
      }

      const { error: weeklyTasksDeleteError } = await weeklyTasksDeleteQuery

      if (weeklyTasksDeleteError) {
        console.error('❌ Weekly tasks delete error:', weeklyTasksDeleteError)
        throw new Error(`Failed to delete weekly tasks: ${weeklyTasksDeleteError.message}`)
      } else {
        console.log('✅ Weekly tasks deleted successfully!')
      }

      const weeklyTasksCount = weeklyTasks?.length || 0

      if (deletedCount > 0 || weeklyTasksCount > 0) {
        toast({
          title: "Bulk Delete Complete",
          description: `Successfully deleted ALL ${deletedCount} stock items and ${weeklyTasksCount} weekly tasks from the database.`,
        })
        setTotalStockItems(0) // Update the count
      } else {
        toast({
          title: "No Items Found",
          description: "No stock items or weekly tasks were found to delete.",
        })
      }
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to perform bulk delete")
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Branch Context Banner */}
      {selectedBranch ? (
        <Alert className="bg-blue-900/30 border-blue-700">
          <Building className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200">
            <strong>📍 Uploading to: {selectedBranch.name} ({selectedBranch.code})</strong>
            {selectedBranch.region && ` - ${selectedBranch.region}`}
            <br />
            <span className="text-sm">All items in your file will be assigned to this branch.</span>
            {branchColumnDetected && (
              <span className="text-sm block mt-1 text-yellow-300">
                ⚠️ Branch column detected in file - it will be ignored.
              </span>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No branch selected. Please select a branch before uploading.
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-4"
              onClick={() => window.location.href = '/branch-selection'}
            >
              Select Branch
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
                  <AlertDialogTitle className="text-red-600">⚠️ Delete Stock Items & Weekly Tasks</AlertDialogTitle>
                  <AlertDialogDescription>
                    <span className="text-red-600 font-medium">
                      ⚠️ WARNING: This will permanently delete {isSystemAdmin ? `ALL ${totalStockItems} stock items AND ALL weekly tasks from ALL branches` : `${totalStockItems} stock items AND weekly tasks from ${selectedBranch?.name || 'selected branch'}`}.
                    </span>
                    <br /><br />
                    This action cannot be undone and will permanently remove {isSystemAdmin ? 'ALL' : 'branch'} stock items and weekly tasks from the system.
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
              {/* ✅ Template Selection */}
              {availableTemplates.length > 0 && (
                <div>
                  <Label htmlFor="template">Import Template (Optional)</Label>
                  <Select
                    value={selectedTemplate}
                    onValueChange={setSelectedTemplate}
                  >
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Select a template or use default column names" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None (Use default column names)</SelectItem>
                      {availableTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} {template.is_default && '(Default)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-1">
                    Templates help map your file columns to database fields. If no template is selected, standard column names will be used.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="file">Excel File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
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

      {/* Preview Dialog */}
      <UploadPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        items={previewItems}
        onConfirm={handlePreviewConfirm}
        onCancel={() => {
          setDbDuplicates(new Map()) // ✅ Clear database duplicates on cancel
          setShowPreview(false)
          setPreviewItems([])
        }}
        dbDuplicates={dbDuplicates} // ✅ Pass database duplicates to preview dialog
        selectedBranch={selectedBranch} // ✅ Pass selected branch for confirmation
        uploadMode={reconcile ? 'reconcile' : 'insert'} // ✅ Pass upload mode
      />

      {/* ✅ Upload Progress Dialog */}
      <UploadProgressDialog
        open={showProgress}
        totalItems={previewItems.length}
        currentItem={currentUploadIndex}
        progressItems={uploadProgress}
        uploadSpeed={uploadSpeed}
        estimatedTimeRemaining={estimatedTimeRemaining}
        onCancel={handleCancelUpload}
        isCancelling={isCancelling}
      />

      {/* ✅ Post-Upload Summary Dialog */}
      <PostUploadSummaryDialog
        open={showSummary}
        onOpenChange={(open) => {
          setShowSummary(open)
          // When closing summary, clear form if all items succeeded and not cancelled
          if (!open && uploadedItemsSummary.length > 0 && errorItemsSummary.length === 0 && !cancelRef.current) {
            // Small delay to let user see the summary before clearing
            setTimeout(() => {
              clearUploadData()
              // Reset summary state
              setUploadedItemsSummary([])
              setErrorItemsSummary([])
              setDuplicateItemsSummary([])
              setReconcileStats(undefined)
            }, 500)
          }
        }}
        uploadedItems={uploadedItemsSummary}
        errorItems={errorItemsSummary}
        duplicateItems={duplicateItemsSummary}
        totalItems={previewItems.length}
        onRollback={handleRollbackUpload}
        onViewItems={() => {
          setShowSummary(false)
          // Show uploaded items (combine success and error items for viewing)
          const allItemsForView = [...uploadedItemsSummary, ...errorItemsSummary].map(item => ({
            product_name: item.product_name,
            branch_id: item.branch_id,
            branch_name: item.branch_name,
            expiry_date: item.expiry_date,
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
          setUploadedItems(allItemsForView as StockItem[])
          setShowUploadedItems(true)
        }}
        isRollingBack={isRollingBack}
        uploadMode={uploadMode}
        reconcileStats={reconcileStats}
      />
    </div>
  )
}

export default StockUpload
