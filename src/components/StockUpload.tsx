import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react'
import { flushSync } from 'react-dom'
import { createPortal } from 'react-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Package, Upload, Download, Plus, Search, Filter, BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, Clock, DollarSign, Building, User, Calendar, Trash2, Edit, Eye, EyeOff, FileText, CheckSquare, XSquare, AlertCircle, Loader2, X } from 'lucide-react'
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
  batch_number?: string | null
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
  const overlayKeepAliveInterval = useRef<NodeJS.Timeout | null>(null) // ✅ Interval to keep overlay visible
  
  // ✅ Helper function to update progress without blocking UI
  const updateProgress = useCallback((updater: (prev: UploadProgressItem[]) => UploadProgressItem[]) => {
    startTransition(() => {
      setUploadProgress(updater)
    })
  }, [])
  
  // ✅ Helper to show/hide overlay using direct DOM manipulation
  const showOverlayImmediately = useCallback(() => {
    if (typeof document !== 'undefined') {
      let overlay = document.getElementById('stock-upload-overlay') as HTMLDivElement
      if (!overlay) {
        // Create overlay with all inline styles (no CSS dependencies)
        overlay = document.createElement('div')
        overlay.id = 'stock-upload-overlay'
        
        // Use simple, reliable styles that work everywhere
        overlay.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0, 0, 0, 0.95) !important;
          z-index: 2147483647 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          pointer-events: auto !important;
        `
        
        overlay.innerHTML = `
          <div style="background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); border: 2px solid #e5e7eb; max-width: 28rem; width: calc(100% - 2rem); margin: 1rem;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
              <div id="spinner" style="width: 3rem; height: 3rem; border: 3px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <h3 style="font-size: 1.125rem; font-weight: 600; color: #111827; margin: 0;">Processing File...</h3>
              <p style="font-size: 0.875rem; color: #6b7280; text-align: center; margin: 0;">Please wait while we read and process your Excel file. This may take a moment.</p>
              <div style="width: 100%; background: #f3f4f6; border-radius: 9999px; height: 0.5rem; margin-top: 1rem;">
                <div style="background: #3b82f6; height: 0.5rem; border-radius: 9999px; width: 60%;"></div>
              </div>
            </div>
          </div>
          <style>
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        `
        
        document.body.appendChild(overlay)
      } else {
        // Overlay exists, just show it
        overlay.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0, 0, 0, 0.95) !important;
          z-index: 2147483647 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          pointer-events: auto !important;
        `
      }
      
      // Force multiple repaints to ensure visibility
      void overlay.offsetHeight
      requestAnimationFrame(() => {
        void overlay.offsetHeight
        requestAnimationFrame(() => {
          void overlay.offsetHeight
        })
      })
    }
  }, [])
  
  // Keep overlay alive during blocking operations
  const keepOverlayAlive = useCallback(() => {
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('stock-upload-overlay')
      if (overlay && loading) {
        // Force overlay to stay visible
        overlay.style.display = 'flex'
        overlay.style.visibility = 'visible'
        overlay.style.opacity = '1'
        overlay.style.zIndex = '2147483647'
        overlay.style.background = 'rgba(0, 0, 0, 0.95)'
        // Force a repaint
        void overlay.offsetHeight
      }
    }
  }, [loading])
  
  // Start keep-alive interval
  const startOverlayKeepAlive = useCallback(() => {
    if (overlayKeepAliveInterval.current) {
      clearInterval(overlayKeepAliveInterval.current)
    }
    overlayKeepAliveInterval.current = setInterval(() => {
      keepOverlayAlive()
    }, 100) // Check every 100ms
  }, [keepOverlayAlive])
  
  // Stop keep-alive interval
  const stopOverlayKeepAlive = useCallback(() => {
    if (overlayKeepAliveInterval.current) {
      clearInterval(overlayKeepAliveInterval.current)
      overlayKeepAliveInterval.current = null
    }
  }, [])
  
  const hideOverlayImmediately = useCallback(() => {
    // Stop keep-alive interval first
    stopOverlayKeepAlive()
    
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('stock-upload-overlay')
      if (overlay) {
        overlay.style.display = 'none'
      }
    }
  }, [stopOverlayKeepAlive])
  
  // Pre-create overlay on mount so it's ready instantly
  useEffect(() => {
    showOverlayImmediately()
    hideOverlayImmediately() // Hide it initially
    return () => {
      hideOverlayImmediately()
    }
  }, [showOverlayImmediately, hideOverlayImmediately])
  
  const [uploadedItemsSummary, setUploadedItemsSummary] = useState<UploadedItem[]>([]) // ✅ Successfully uploaded items
  const [errorItemsSummary, setErrorItemsSummary] = useState<UploadedItem[]>([]) // ✅ Failed items
  const [duplicateItemsSummary, setDuplicateItemsSummary] = useState<UploadedItem[]>([]) // ✅ Duplicate items
  const [isRollingBack, setIsRollingBack] = useState(false) // ✅ Rollback in progress
  const [uploadMode, setUploadMode] = useState<'insert' | 'reconcile'>('insert') // ✅ Upload mode
  const [reconcileStats, setReconcileStats] = useState<{ inserted: number; updated: number; failed: number } | undefined>() // ✅ Reconcile statistics
  const [selectedTemplate, setSelectedTemplate] = useState<string>('') // ✅ Selected import template
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]) // ✅ Available templates
  const [uploadError, setUploadError] = useState<string | null>(null) // ✅ Upload error state
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

  // ✅ Branch-scoped: Always filter by selected branch when available
  const fetchTotalStockItems = async () => {
    try {
      // If no branch selected, don't fetch
      if (!selectedBranch) {
        setTotalStockItems(0)
        return
      }

      let query = supabase
        .from('stock_items')
        .select('*', { count: 'exact', head: true })

      // ✅ Always filter by selected branch (compartmentalized)
      query = query.eq('branch_id', selectedBranch.id)

      const { count, error } = await query
      
      if (error) throw error
      setTotalStockItems(count || 0)
    } catch (error: unknown) {
      console.error('Error fetching total stock items:', error)
    }
  }

  const parseDate = (dateValue: unknown): string | null => {
    // Handle null, undefined, empty string, or zero
    if (!dateValue || dateValue === '' || dateValue === null || dateValue === undefined) {
      return null
    }
    
    // Handle number 0 or very small numbers (likely invalid)
    if (typeof dateValue === 'number') {
      // Excel date serial number 0 or negative = invalid/empty
      if (dateValue <= 0 || dateValue < 1) {
        return null
      }
      // Excel date serial number (days since 1900-01-01)
      // Excel stores dates as numbers (e.g., 1 = 1900-01-01, 2 = 1900-01-02)
      const excelEpoch = new Date(1900, 0, 1)
      const days = dateValue - 2 // Excel counts from 1900-01-01 as day 1, but Date counts from 1900-01-01 as day 0
      const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000)
      // Check if date is valid and reasonable (not epoch 1970)
      if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
        const result = date.toISOString().split('T')[0]
        // Double-check: if it's 1970-01-01, it's likely an error (empty cell read as 0)
        if (result === '1970-01-01') {
          return null
        }
        return result
      }
      return null
    }
    
    if (dateValue instanceof Date) {
      // Check if date is valid and not epoch
      if (!isNaN(dateValue.getTime()) && dateValue.getFullYear() >= 1900 && dateValue.getFullYear() < 2100) {
        const result = dateValue.toISOString().split('T')[0]
        // Double-check: if it's 1970-01-01, it's likely an error
        if (result === '1970-01-01') {
          return null
        }
        return result
      }
      return null
    }
    
    if (typeof dateValue === 'string') {
      const cleanDate = dateValue.trim()
      
      // Skip empty strings and common "empty" indicators
      if (cleanDate === '' || cleanDate === 'null' || cleanDate === 'NULL' || cleanDate === 'N/A' || cleanDate === 'n/a' || cleanDate === '-' || cleanDate === '0') {
        return null
      }
      
      // DD/MM/YYYY format (e.g., "30/09/2025")
      const ddmmyyyyMatch = cleanDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
          const result = date.toISOString().split('T')[0]
          if (result === '1970-01-01') {
            return null
          }
          return result
        }
      }
      
      // YYYY/MM/DD format
      const yyyymmddMatch = cleanDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      if (yyyymmddMatch) {
        const [, year, month, day] = yyyymmddMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
          const result = date.toISOString().split('T')[0]
          if (result === '1970-01-01') {
            return null
          }
          return result
        }
      }
      
      // YYYY-MM-DD format
      const yyyymmddDashMatch = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (yyyymmddDashMatch) {
        const [, year, month, day] = yyyymmddDashMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
          const result = date.toISOString().split('T')[0]
          if (result === '1970-01-01') {
            return null
          }
          return result
        }
      }
      
      // Try native Date parsing for other formats (Excel date strings, etc.)
      const parsed = new Date(cleanDate)
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1900 && parsed.getFullYear() < 2100) {
        const result = parsed.toISOString().split('T')[0]
        // Reject 1970-01-01 as it's likely an error
        if (result === '1970-01-01') {
          return null
        }
        return result
      }
    }
    
    return null
  }

  const handleFileUpload = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    console.log('🚀 Upload button clicked!', { file: !!file, selectedBranch: !!selectedBranch, loading })
    
    if (!file) {
      console.error('❌ No file selected')
      toast({
        title: "Error",
        description: "Please select a file first",
        variant: "destructive",
      })
      return
    }

    if (!selectedBranch) {
      console.error('❌ No branch selected')
      toast({
        title: "Error",
        description: "Please select a branch first",
        variant: "destructive",
      })
      return
    }

    // Prevent double-clicks
    if (loading) {
      console.warn('⚠️ Upload already in progress, ignoring click')
      return
    }

    console.log('✅ Starting upload process...')
    
    // Clear any previous errors
    setUploadError(null)
    
    // CRITICAL: Show overlay SYNCHRONOUSLY before ANY async operations
    // This must happen immediately, no awaits before this
    if (typeof document !== 'undefined') {
      // Create/show overlay with absolute minimum code - no dependencies
      let overlay = document.getElementById('stock-upload-overlay') as HTMLDivElement
      if (!overlay) {
        overlay = document.createElement('div')
        overlay.id = 'stock-upload-overlay'
        document.body.appendChild(overlay)
      }
      
      // Set styles directly - no CSS variables, no dependencies
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.right = '0'
      overlay.style.bottom = '0'
      overlay.style.background = 'rgba(0, 0, 0, 0.95)'
      overlay.style.zIndex = '2147483647'
      overlay.style.display = 'flex'
      overlay.style.alignItems = 'center'
      overlay.style.justifyContent = 'center'
      overlay.style.pointerEvents = 'auto'
      
      // Use inline HTML string - no template literals for maximum speed
      overlay.innerHTML = '<div style="background:white;padding:2rem;border-radius:0.5rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);max-width:28rem;width:calc(100% - 2rem);"><div style="display:flex;flex-direction:column;align-items:center;gap:1rem;"><div id="spinner" style="width:3rem;height:3rem;border:3px solid #3b82f6;border-top-color:transparent;border-radius:50%;"></div><h3 style="font-size:1.125rem;font-weight:600;color:#111827;margin:0;">Processing File...</h3><p style="font-size:0.875rem;color:#6b7280;text-align:center;margin:0;">Please wait...</p></div></div><style>#spinner{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>'
      
      // Force multiple repaints to ensure visibility
      void overlay.offsetHeight
      requestAnimationFrame(() => {
        void overlay.offsetHeight
        requestAnimationFrame(() => {
          void overlay.offsetHeight
        })
      })
      
      console.log('✅ Overlay created and shown synchronously')
    }
    
    // Also set React state for consistency
    flushSync(() => {
      setLoading(true)
    })
    
    // Start keep-alive interval to ensure overlay stays visible
    startOverlayKeepAlive()
    
    // Wait for overlay to be painted - but do this AFTER showing it
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 100)
          })
        })
      })
    })
    
    console.log('✅ Loading overlay should now be visible')

    try {
      console.log('📖 Reading file...')
      
      // Validate file first
      if (!file || file.size === 0) {
        throw new Error('File is empty or invalid. Please select a valid Excel file.')
      }
      
      // Read file asynchronously
      let data: ArrayBuffer
      try {
        data = await file.arrayBuffer()
      } catch (readError) {
        throw new Error(`Failed to read file: ${readError instanceof Error ? readError.message : 'Unknown error'}`)
      }
      
      if (!data || data.byteLength === 0) {
        throw new Error('File appears to be empty or corrupted.')
      }
      
      console.log('📊 Parsing Excel file in Web Worker (non-blocking)...')
      
      // CRITICAL: Parse Excel in Web Worker to prevent UI blocking
      // This allows files of any size to be processed without freezing the browser
      let jsonData: StockRow[]
      
      try {
        // Keep overlay alive before parsing
        keepOverlayAlive()
        
        // Try to use Web Worker for non-blocking parsing
        let useWorker = true
        let worker: Worker | null = null
        
        try {
          worker = new Worker(
            new URL('../workers/excelParser.worker.ts', import.meta.url),
            { type: 'module' }
          )
        } catch (workerError) {
          console.warn('⚠️ Web Worker not available, using main thread with delays')
          useWorker = false
        }
        
        if (useWorker && worker) {
          // Parse in worker (non-blocking)
          jsonData = await new Promise<StockRow[]>((resolve, reject) => {
            // Keep overlay alive periodically during parsing
            const keepAliveInterval = setInterval(() => {
              keepOverlayAlive()
            }, 100)
            
            // Set timeout for very large files (5 minutes)
            const timeout = setTimeout(() => {
              clearInterval(keepAliveInterval)
              if (worker) worker.terminate()
              reject(new Error('File parsing timed out. The file may be too large or corrupted.'))
            }, 5 * 60 * 1000)
            
            worker.onmessage = (e: MessageEvent) => {
              clearInterval(keepAliveInterval)
              clearTimeout(timeout)
              if (worker) worker.terminate()
              
              if (e.data.error) {
                reject(new Error(e.data.error))
              } else if (e.data.success) {
                resolve(e.data.data as StockRow[])
              } else {
                reject(new Error('Unknown error parsing file'))
              }
            }
            
            worker.onerror = (error) => {
              clearInterval(keepAliveInterval)
              clearTimeout(timeout)
              if (worker) worker.terminate()
              reject(new Error(`Worker error: ${error.message}`))
            }
            
            // Send data to worker
            worker.postMessage({ data, type: 'parse' })
          })
        } else {
          // Fallback: Parse in main thread with periodic yields
          console.log('📊 Parsing in main thread with periodic yields...')
          
          // Break parsing into chunks with yields
          const workbook = await new Promise<XLSX.WorkBook>((resolve, reject) => {
            // Yield before parsing
            setTimeout(() => {
              keepOverlayAlive()
              try {
                const result = XLSX.read(data, { 
                  type: 'array',
                  cellDates: true,  // Parse dates as Date objects
                  cellNF: false,
                  cellText: false,
                  dense: false
                })
                resolve(result)
              } catch (parseError) {
                reject(parseError)
              }
            }, 100)
          })
          
          keepOverlayAlive()
          await new Promise(resolve => setTimeout(resolve, 50))
          
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('Excel file contains no worksheets.')
          }
          
          const worksheet = workbook.Sheets[workbook.SheetNames[0]]
          if (!worksheet) {
            throw new Error('Could not read the first worksheet from the file.')
          }
          
          keepOverlayAlive()
          
          jsonData = await new Promise<StockRow[]>((resolve, reject) => {
            setTimeout(() => {
              keepOverlayAlive()
              try {
                const result = XLSX.utils.sheet_to_json(worksheet, {
                  defval: null, // Empty cells become null, not empty string
                  raw: false, // Convert dates and numbers to strings
                  blankrows: false // Skip blank rows
                }) as StockRow[]
                resolve(result)
              } catch (error) {
                reject(error)
              }
            }, 50)
          })
        }
        
        // Keep overlay alive after parsing
        keepOverlayAlive()
        
        // Small yield after parsing
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (parseError) {
        throw new Error(`Failed to parse Excel file: ${parseError instanceof Error ? parseError.message : 'Invalid file format. Please ensure it is a valid .xlsx, .xls, or .csv file.'}`)
      }
      
      if (!jsonData || jsonData.length === 0) {
        throw new Error('No data found in the Excel file. Please ensure the file contains rows with data.')
      }
      
      console.log(`✅ Parsed ${jsonData.length} rows from file`)

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
            setLoading(false)
            hideOverlayImmediately()
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
            setLoading(false)
            hideOverlayImmediately()
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
          setLoading(false)
          hideOverlayImmediately()
          return
        }
      } else {
        console.log('✅ Using existing branches from state:', currentBranches)
      }

      // Yield to browser before heavy processing
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const stockItems: StockItem[] = []

      // ✅ TEMPLATE INTEGRATION: Get template column mappings if template selected
      let columnMapping: Record<string, string> = {}
      let defaultValues: Record<string, any> = {}
      
      if (selectedTemplate) {
        try {
          console.log('📋 Loading template...')
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
      
      // Yield before processing rows
      await new Promise(resolve => setTimeout(resolve, 10))

      // Helper function to normalize column names for matching (case-insensitive, ignore spaces/underscores)
      const normalizeColumnName = (name: string): string => {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '')
      }

      // Helper function to find column by normalized name
      // Prioritizes exact matches first, then case-insensitive matches
      const findColumn = (row: StockRow, possibleKeys: string[]): string | null => {
        const rowKeys = Object.keys(row)
        
        // First, check for exact matches (case-sensitive) - highest priority
        for (const key of possibleKeys) {
          if (rowKeys.includes(key) && row[key] !== undefined && row[key] !== '') {
            return key
          }
        }
        
        // Then, check for case-insensitive matches
        for (const key of possibleKeys) {
          const normalizedKey = normalizeColumnName(key)
          const found = rowKeys.find(k => normalizeColumnName(k) === normalizedKey)
          if (found && row[found] !== undefined && row[found] !== '') {
            return found
          }
        }
        return null
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

        // Then try fallback keys (case-insensitive matching)
        const foundColumn = findColumn(row, fallbackKeys)
        if (foundColumn) {
          return row[foundColumn]
        }

        // Special handling for expiry_date: try to auto-detect date columns if not found
        if (dbField === 'expiry_date' && !foundColumn) {
          const rowKeys = Object.keys(row)
          // Look for any column that might be a date (contains date/expiry/exp)
          const dateColumn = rowKeys.find(key => {
            const lowerKey = key.toLowerCase()
            return (lowerKey.includes('date') || lowerKey.includes('expiry') || lowerKey.includes('exp')) &&
                   row[key] !== undefined && row[key] !== null && row[key] !== ''
          })
          if (dateColumn) {
            console.log(`💡 Auto-detected expiry date column: "${dateColumn}"`)
            return row[dateColumn]
          }
        }

        // Finally try default value from template
        if (defaultValues[dbField] !== undefined) {
          return defaultValues[dbField]
        }

        return null
      }

      // Log detected columns for debugging (first row only)
      if (jsonData.length > 0) {
        const firstRow = jsonData[0]
        const detectedColumns = Object.keys(firstRow)
        console.log('📋 Detected columns in file:', detectedColumns)
        console.log('📋 Expected columns: product_name, expiry_date, quantity, unit_price, branch')
        
        // Check which expected columns are found (prioritize exact names)
        const expectedColumns = ['product_name', 'expiry_date', 'quantity', 'unit_price', 'branch']
        expectedColumns.forEach(col => {
          // First check for exact match (case-sensitive)
          if (firstRow[col] !== undefined) {
            console.log(`✅ Found exact column "${col}" with value:`, firstRow[col])
          } else {
            // Then check case-insensitive
            const found = findColumn(firstRow, [col])
            if (found) {
              console.log(`✅ Found column "${col}" as "${found}" (case-insensitive match) with value:`, firstRow[found])
            } else {
              console.warn(`⚠️ Column "${col}" not found in file`)
              // Try to find similar column names
              const similar = detectedColumns.filter(c => 
                c.toLowerCase().includes(col.toLowerCase()) || 
                col.toLowerCase().includes(c.toLowerCase())
              )
              if (similar.length > 0) {
                console.log(`💡 Similar columns found:`, similar)
              }
            }
          }
        })
        
        // Special check for expiry_date - show all date-like columns
        const dateLikeColumns = detectedColumns.filter(c => 
          /date|expiry|exp|expire/i.test(c)
        )
        if (dateLikeColumns.length > 0) {
          console.log('📅 Date-like columns found:', dateLikeColumns)
          dateLikeColumns.forEach(col => {
            console.log(`  - "${col}":`, firstRow[col])
          })
        }
      }

      // Check if branch column exists in Excel (to show warning) - case-insensitive
      const hasBranchColumn = jsonData.some(row => {
        const branchKeys = ['branch', 'Branch', 'BranchName', 'branch_name', 'BRANCH']
        return branchKeys.some(key => row[key] !== undefined && row[key] !== '') ||
               findColumn(row, ['branch']) !== null
      })
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
        hideOverlayImmediately()
        return
      }

      console.log('🔄 Processing rows...')
      // Process rows in smaller batches with longer yields to prevent UI blocking
      const BATCH_SIZE = 50 // Reduced batch size
      for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
        // Yield to browser before each batch - use requestAnimationFrame for smoother UI
        await new Promise(resolve => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(resolve, { timeout: 50 })
          } else {
            requestAnimationFrame(() => setTimeout(resolve, 20))
          }
        })
        
        const batch = jsonData.slice(i, i + BATCH_SIZE)
        
        // Process batch synchronously (small enough to not block)
        batch.forEach((row: StockRow, batchIndex: number) => {
          const index = i + batchIndex
          // ✅ Use template mapping or fallback to standard column names (case-insensitive)
          // Prioritize exact column names: branch, product_name, expiry_date, quantity, unit_price
          const productName = getMappedValue(row, 'product_name', ['product_name', 'Product', 'ProductName', 'name', 'Name', 'product name']) || ''
          
          // Enhanced expiry_date detection - try more variations
          const expiryDateRaw = getMappedValue(row, 'expiry_date', [
            'expiry_date',      // Exact match first
            'expiry date',      // With space
            'expiry-date',      // With hyphen
            'ExpiryDate',       // CamelCase
            'Expiry Date',      // Title Case with space
            'Expiry-Date',      // Title Case with hyphen
            'Expiry',           // Short form
            'expiry',           // Lowercase
            'EXPIRY',           // Uppercase
            'exp_date',         // Abbreviated
            'exp date',         // Abbreviated with space
            'expiration_date',  // Full word
            'expiration date',  // Full word with space
            'date',             // Generic date
            'Date',             // Generic date capitalized
            'DATE'              // Generic date uppercase
          ])
          
          // Log if expiry_date is not found (only for first row to avoid spam)
          if (index === 0 && !expiryDateRaw) {
            console.warn('⚠️ Expiry date not found in first row. Available columns:', Object.keys(row))
            console.warn('⚠️ Row data:', row)
          }
          
          const quantityRaw = getMappedValue(row, 'quantity', ['quantity', 'Quantity', 'qty', 'Qty', 'QTY'])
          const unitPriceRaw = getMappedValue(row, 'unit_price', ['unit_price', 'UnitPrice', 'Price', 'price', 'cost', 'Cost', 'unit price', 'Unit Price'])
          const branchRaw = getMappedValue(row, 'branch', ['branch', 'Branch', 'BranchName', 'branch_name', 'BRANCH'])
          
          // ✅ Get batch_number from Excel - recognize various column name formats
          const batchNumberRaw = getMappedValue(row, 'batch_number', [
            'batch_number',      // Exact match first
            'batch number',      // With space
            'batch-number',      // With hyphen
            'BatchNumber',       // CamelCase
            'Batch Number',      // Title Case with space
            'Batch-Number',      // Title Case with hyphen
            'Batch',            // Short form
            'batch',            // Lowercase
            'BATCH',            // Uppercase
            'batch_no',         // Abbreviated
            'batch no',         // Abbreviated with space
            'lot_number',       // Alternative name
            'lot number',       // Alternative with space
            'lot',              // Short alternative
            'Lot',              // Short alternative capitalized
          ])
          
          // Parse batch_number - convert to string and trim, or null if empty
          let batchNumber: string | null = null
          if (batchNumberRaw !== null && batchNumberRaw !== undefined && batchNumberRaw !== '') {
            const batchStr = String(batchNumberRaw).trim()
            if (batchStr.length > 0) {
              batchNumber = batchStr
            }
          }
          
          let parsedDate = parseDate(expiryDateRaw)
          
          // If date parsed to epoch (1970-01-01), treat as null
          if (parsedDate && parsedDate.startsWith('1970-01-01')) {
            console.warn(`⚠️ Row ${index}: Date parsed to epoch (1970), treating as null. Raw value:`, expiryDateRaw)
            parsedDate = null
          }
          
          // Log parsing result for first few rows to debug
          if (index < 3) {
            console.log(`📅 Row ${index} expiry date:`, {
              raw: expiryDateRaw,
              rawType: typeof expiryDateRaw,
              parsed: parsedDate,
              isNull: parsedDate === null
            })
            console.log(`🏷️ Row ${index} batch number:`, {
              raw: batchNumberRaw,
              parsed: batchNumber
            })
          }
          
          // Parse quantity - handle strings and numbers (with or without commas)
          // Supports any number from 1 to very large numbers (JavaScript's safe integer limit)
          let quantity = 0
          if (quantityRaw !== null && quantityRaw !== undefined && quantityRaw !== '') {
            // Remove commas, spaces, and other formatting characters
            const qtyStr = String(quantityRaw).replace(/[,\s]/g, '').trim()
            // Parse as integer - supports very large numbers
            const parsedQty = parseInt(qtyStr, 10)
            if (!isNaN(parsedQty) && isFinite(parsedQty) && parsedQty > 0) {
              quantity = parsedQty
            } else {
              // If parsing fails, try to extract just the numeric part
              const numericMatch = qtyStr.match(/^\d+/)
              if (numericMatch) {
                const extractedQty = parseInt(numericMatch[0], 10)
                if (!isNaN(extractedQty) && extractedQty > 0) {
                  quantity = extractedQty
                }
              }
            }
          }
          
          // Parse unit_price - handle strings with or without commas (e.g., "6,000" or "6000")
          // Supports any positive number including decimals
          let unitPrice = 0
          if (unitPriceRaw !== null && unitPriceRaw !== undefined && unitPriceRaw !== '') {
            // Remove commas and spaces, keep decimal points
            const priceStr = String(unitPriceRaw).replace(/[,\s]/g, '').trim()
            // Parse as float - supports very large numbers and decimals
            const parsedPrice = parseFloat(priceStr)
            if (!isNaN(parsedPrice) && isFinite(parsedPrice) && parsedPrice > 0) {
              unitPrice = parsedPrice
            } else {
              // If parsing fails, try to extract just the numeric part (including decimals)
              const numericMatch = priceStr.match(/^\d+\.?\d*/)
              if (numericMatch) {
                const extractedPrice = parseFloat(numericMatch[0])
                if (!isNaN(extractedPrice) && extractedPrice > 0) {
                  unitPrice = extractedPrice
                }
              }
            }
          }
          
          // AUTO-ASSIGN: Use selected branch from context (ignore Excel branch column)
          const item = {
            product_name: String(productName).trim(),
            branch_id: selectedBranch.id, // ✅ Always use selected branch
            branch_name: selectedBranch.name, // ✅ Always use selected branch name
            expiry_date: parsedDate,
            quantity: quantity,
            unit_price: unitPrice,
            batch_number: batchNumber, // ✅ Include batch_number
          }
          
          // Add ALL items to stockItems (including invalid ones - they'll be processed)
          // Don't filter here - let user decide in preview dialog
          stockItems.push(item as StockItem)
        })
      }
      
      console.log(`✅ Processed ${stockItems.length} items`)

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

      // Validate we have items to process
      if (stockItems.length === 0) {
        throw new Error('No valid stock items found in the file. Please check that your file contains the required columns: product_name, expiry_date, quantity, and unit_price.')
      }
      
      console.log(`✅ Found ${stockItems.length} stock items to process`)
      
      // Validate we have items to process
      if (stockItems.length === 0) {
        throw new Error('No valid stock items found in the file. Please check that your file contains the required columns: product_name, expiry_date, quantity, and unit_price.')
      }
      
      console.log(`✅ Found ${stockItems.length} stock items to process`)
      
      // Convert to validation format
      const itemsForValidation: StockItemForValidation[] = stockItems.map(item => ({
        product_name: item.product_name,
        branch_id: item.branch_id,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))

      // Yield before duplicate check
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // ✅ DATABASE DUPLICATE DETECTION: Check for duplicates in database (non-blocking, limited check)
      // Only check first 100 items to avoid blocking the upload process
      let dbDuplicates = new Map<string, StockItemForValidation[]>()
      if (itemsForValidation.length > 0) {
        try {
          console.log('🔍 Checking for database duplicates (first 100 items only)...')
          // Run duplicate check in background without blocking
          const duplicateCheckPromise = (async () => {
            const { checkDuplicatesInDatabase } = await import('@/utils/uploadValidation')
            return checkDuplicatesInDatabase(itemsForValidation, supabase)
          })()
          
          const timeoutPromise = new Promise<Map<string, StockItemForValidation[]>>((resolve) => {
            setTimeout(() => {
              console.log('⏱️ Duplicate check timed out, continuing with upload')
              resolve(new Map())
            }, 2000) // Reduced to 2 second timeout
          })
          
          dbDuplicates = await Promise.race([duplicateCheckPromise, timeoutPromise])
          
          if (dbDuplicates.size > 0) {
            const duplicateCount = Array.from(dbDuplicates.values()).flat().length
            toast({
              title: "Database Duplicates Detected",
              description: `${duplicateCount} item(s) already exist in the database. They will be highlighted in the preview.`,
              variant: "default",
            })
          }
        } catch (error) {
          console.warn('Duplicate check failed or timed out, continuing with upload:', error)
          // Continue without duplicate check - duplicates will be handled during reconcile mode
          dbDuplicates = new Map() // Ensure it's initialized
        }
      }

      // Store database duplicates in state to pass to preview dialog
      // Use startTransition to prevent blocking UI
      startTransition(() => {
        setDbDuplicates(dbDuplicates)
        setPreviewItems(itemsForValidation)
      })
      
      // Show preview dialog immediately - use multiple render cycles to ensure UI updates
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      
      // Set preview state
      setShowPreview(true)
      
      // Reset loading after preview is shown
      await new Promise(resolve => requestAnimationFrame(resolve))
      setLoading(false)
      hideOverlayImmediately()
      
      console.log('✅ File processing complete, showing preview')

    } catch (error: unknown) {
      console.error('❌ Upload error:', error)
      
      // Provide more detailed error information
      let errorMessage = "Failed to process file"
      let errorDetails = ""
      
      if (error instanceof Error) {
        errorMessage = error.message || "An error occurred while processing the file"
        errorDetails = error.stack || ""
        console.error('Error stack:', error.stack)
      } else if (typeof error === 'object' && error !== null) {
        try {
          errorMessage = JSON.stringify(error)
        } catch {
          errorMessage = String(error)
        }
      } else {
        errorMessage = String(error)
      }
      
      // Check for specific error types
      if (errorMessage.includes('Cannot read') || errorMessage.includes('undefined')) {
        errorMessage = "File format error: Please ensure the file is a valid Excel file (.xlsx, .xls, or .csv)"
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = "Network error: Please check your internet connection and try again"
      } else if (errorMessage.includes('timeout')) {
        errorMessage = "Request timeout: The operation took too long. Please try with a smaller file or check your connection"
      }
      
      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
        duration: 10000, // Show for 10 seconds
      })
      
      // Always reset loading state
      setLoading(false)
      hideOverlayImmediately()
      
      // Set error state for display
      setUploadError(errorMessage)
      
      // Log full error for debugging
      if (errorDetails) {
        console.error('Full error details:', errorDetails)
      }
    } finally {
      // Ensure loading is always reset
      setLoading(false)
      hideOverlayImmediately()
    }
  }

  const handlePreviewConfirm = async (validItems: StockItemForValidation[]) => {
    if (validItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "No items to upload. All items were removed. Please ensure at least some items are selected.",
        variant: "destructive",
      })
      setShowPreview(false)
      return
    }
    
    // Log what we're processing (including duplicates and invalid items)
    console.log(`📤 Processing ${validItems.length} items (including duplicates and invalid items if any)`)

    // ✅ Initialize progress tracking
    const progressItems: UploadProgressItem[] = validItems.map((item, index) => ({
      index,
      product_name: item.product_name,
      status: 'pending' as const
    }))
    
    // Use startTransition for non-urgent updates to prevent blocking
    startTransition(() => {
      setUploadProgress(progressItems)
    })
    setCurrentUploadIndex(0)
    setUploadSpeed(0)
    setEstimatedTimeRemaining(0)
    
    setIsCancelling(false)
    cancelRef.current = false // ✅ Reset cancellation ref
    setUploadStartTime(Date.now())
    
    // Close preview and open progress dialog immediately
    setShowPreview(false)
    setShowProgress(true) // ✅ Open progress dialog immediately
    setLoading(true)
    
    // Small delay to ensure dialog is rendered before starting upload
    await new Promise(resolve => setTimeout(resolve, 100))

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
        // ✅ UPLOAD WITH PROGRESS TRACKING: Batch insert for better performance
        setUploadMode('insert')
        let successCount = 0
        let errorCount = 0
        const startTime = Date.now()
        const uploaded: UploadedItem[] = []
        const errors: UploadedItem[] = []

        // Use batch size for better performance and progress tracking
        const BATCH_SIZE = 50 // Insert 50 items at a time
        const totalBatches = Math.ceil(validItems.length / BATCH_SIZE)

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          // Check for cancellation
          if (cancelRef.current) {
            const remainingStart = batchIndex * BATCH_SIZE
            updateProgress(prev => prev.map((item, idx) => 
              idx >= remainingStart && item.status !== 'success' 
                ? { ...item, status: 'error' as const, error: 'Upload cancelled' } 
                : item
            ))
            break
          }

          const batchStart = batchIndex * BATCH_SIZE
          const batchEnd = Math.min(batchStart + BATCH_SIZE, validItems.length)
          const batch = validItems.slice(batchStart, batchEnd)

          // Update all items in batch to uploading
          updateProgress(prev => prev.map((p, idx) => 
            idx >= batchStart && idx < batchEnd ? { ...p, status: 'uploading' as const } : p
          ))
          setCurrentUploadIndex(batchEnd)

          try {
            // Batch insert all items in this batch
            const batchData = batch.map(item => ({
              product_name: item.product_name,
              branch_id: item.branch_id,
              expiry_date: item.expiry_date,
              quantity: item.quantity,
              unit_price: item.unit_price,
              batch_number: item.batch_number || null // ✅ Include batch_number
            }))

            const { data: insertedData, error } = await supabase
              .from('stock_items')
              .insert(batchData)
              .select()

            if (error) {
              throw error
            }

            // Update all items in batch to success (use startTransition to prevent blocking)
            updateProgress(prev => prev.map((p, idx) => 
              idx >= batchStart && idx < batchEnd ? { ...p, status: 'success' as const } : p
            ))

            // Track successfully uploaded items
            if (insertedData) {
              insertedData.forEach((data, idx) => {
                const originalItem = batch[idx]
                uploaded.push({
                  id: data?.id,
                  product_name: originalItem.product_name,
                  branch_id: originalItem.branch_id,
                  branch_name: selectedBranch?.name,
                  expiry_date: originalItem.expiry_date,
                  quantity: originalItem.quantity,
                  unit_price: originalItem.unit_price,
                  status: 'success'
                })
              })
            }
            successCount += batch.length

            // Calculate upload speed and estimated time (throttle updates)
            const elapsed = (Date.now() - startTime) / 1000 // seconds
            const speed = batchEnd / elapsed // items per second
            startTransition(() => {
              setUploadSpeed(speed)
              const remaining = validItems.length - batchEnd
              const estimated = remaining / speed
              setEstimatedTimeRemaining(Math.ceil(estimated))
            })

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed'
            
            // If batch insert fails, try individual inserts to identify which items failed
            for (let i = 0; i < batch.length; i++) {
              const item = batch[i]
              const itemIndex = batchStart + i
              
              try {
                const { data, error: itemError } = await supabase
                  .from('stock_items')
                  .insert({
                    product_name: item.product_name,
                    branch_id: item.branch_id,
                    expiry_date: item.expiry_date,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    batch_number: item.batch_number || null // ✅ Include batch_number
                  })
                  .select()
                  .single()

                if (itemError) {
                  throw itemError
                }

                updateProgress(prev => prev.map((p, idx) => 
                  idx === itemIndex ? { ...p, status: 'success' as const } : p
                ))

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

              } catch (itemError: unknown) {
                const itemErrorMessage = itemError instanceof Error ? itemError.message : 'Upload failed'
                updateProgress(prev => prev.map((p, idx) => 
                  idx === itemIndex ? { ...p, status: 'error' as const, error: itemErrorMessage } : p
                ))

                errors.push({
                  product_name: item.product_name,
                  branch_id: item.branch_id,
                  branch_name: selectedBranch?.name,
                  expiry_date: item.expiry_date,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  status: 'error',
                  error: itemErrorMessage
                })
                errorCount++
              }
            }
          }

          // Small delay between batches to allow UI updates (much less than per-item delay)
          if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }

        // ✅ Store summary data
        setUploadedItemsSummary(uploaded)
        setErrorItemsSummary(errors)
        setDuplicateItemsSummary([]) // No duplicates in insert mode (already filtered in preview)

        // Close progress dialog
        setShowProgress(false)
        setLoading(false)
        hideOverlayImmediately()

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
        // ✅ RECONCILE WITH PROGRESS TRACKING: Batch operations for better performance
        setUploadMode('reconcile')
        let updated = 0, inserted = 0, failed = 0
        const startTime = Date.now()
        const uploaded: UploadedItem[] = []
        const errors: UploadedItem[] = []
        const duplicates: UploadedItem[] = []

        // ✅ BATCH PROCESSING: Process in batches for better performance
        const BATCH_SIZE = 50 // Process 50 items at a time (reduced for better performance with individual checks)
        const totalBatches = Math.ceil(validItems.length / BATCH_SIZE)

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          // Check for cancellation
          if (cancelRef.current) {
            const remainingStart = batchIndex * BATCH_SIZE
            updateProgress(prev => prev.map((item, idx) => 
              idx >= remainingStart && item.status !== 'success' 
                ? { ...item, status: 'error' as const, error: 'Upload cancelled' } 
                : item
            ))
            break
          }

          const batchStart = batchIndex * BATCH_SIZE
          const batchEnd = Math.min(batchStart + BATCH_SIZE, validItems.length)
          const batch = validItems.slice(batchStart, batchEnd)

          // Update all items in batch to uploading
          updateProgress(prev => prev.map((p, idx) => 
            idx >= batchStart && idx < batchEnd ? { ...p, status: 'uploading' as const } : p
          ))
          setCurrentUploadIndex(batchEnd)

          try {
            // ✅ PARALLEL CHECK: Check each item individually but in parallel (with concurrency limit)
            // This is more efficient than the Cartesian product query
            const CONCURRENCY_LIMIT = 10 // Process 10 checks at a time to avoid overwhelming the database
            
            const checkResults: Array<{
              item: StockItemForValidation
              existing: { id: string; quantity: number } | null
              originalIndex: number
              error: Error | null
            }> = []

            // Process checks in chunks to limit concurrency
            for (let i = 0; i < batch.length; i += CONCURRENCY_LIMIT) {
              const chunk = batch.slice(i, i + CONCURRENCY_LIMIT)
              const chunkPromises = chunk.map(async (item, chunkIdx) => {
                const originalIndex = batchStart + i + chunkIdx
                try {
                  // ✅ Check for duplicates including batch_number
                  let query = supabase
                    .from('stock_items')
                    .select('id, quantity')
                    .eq('product_name', item.product_name)
                    .eq('branch_id', item.branch_id)
                  
                  // Handle expiry_date (can be null)
                  if (item.expiry_date === null || item.expiry_date === undefined || item.expiry_date === '') {
                    query = query.is('expiry_date', null)
                  } else {
                    query = query.eq('expiry_date', item.expiry_date)
                  }
                  
                  // ✅ Handle batch_number in duplicate check
                  if (item.batch_number === null || item.batch_number === undefined || item.batch_number === '') {
                    query = query.is('batch_number', null)
                  } else {
                    query = query.eq('batch_number', String(item.batch_number).trim())
                  }
                  
                  const { data: existing, error: findError } = await query.maybeSingle()

                  if (findError) {
                    return {
                      item,
                      existing: null,
                      originalIndex,
                      error: findError
                    }
                  }

                  return {
                    item,
                    existing: existing && existing.id ? { id: existing.id, quantity: existing.quantity } : null,
                    originalIndex,
                    error: null
                  }
                } catch (error) {
                  return {
                    item,
                    existing: null,
                    originalIndex,
                    error: error instanceof Error ? error : new Error('Check failed')
                  }
                }
              })

              const chunkResults = await Promise.all(chunkPromises)
              checkResults.push(...chunkResults)
            }

            // Separate items into updates and inserts
            const itemsToUpdate: Array<{ item: StockItemForValidation; existing: { id: string; quantity: number }; originalIndex: number }> = []
            const itemsToInsert: Array<{ item: StockItemForValidation; originalIndex: number }> = []

            checkResults.forEach(({ item, existing, originalIndex, error }) => {
              if (error) {
                // If check failed, treat as insert (will fail later if needed)
                itemsToInsert.push({ item, originalIndex })
              } else if (existing) {
                itemsToUpdate.push({ item, existing, originalIndex })
              } else {
                itemsToInsert.push({ item, originalIndex })
              }
            })

            // ✅ BATCH UPDATE: Update existing items
            if (itemsToUpdate.length > 0) {
              // Use individual updates for now (Supabase doesn't support batch updates with different values easily)
              // But we can parallelize them
              const updatePromises = itemsToUpdate.map(async ({ item, existing, originalIndex }) => {
                try {
                  const { error: updateError } = await supabase
                    .from('stock_items')
                    .update({ quantity: existing.quantity + item.quantity })
                    .eq('id', existing.id)

                  if (updateError) {
                    throw updateError
                  }

                  return {
                    success: true,
                    item,
                    existingId: existing.id,
                    originalIndex
                  }
                } catch (error) {
                  return {
                    success: false,
                    item,
                    error: error instanceof Error ? error.message : 'Update failed',
                    originalIndex
                  }
                }
              })

              const updateResults = await Promise.all(updatePromises)

              updateResults.forEach((result) => {
                if (result.success) {
                  updateProgress(prev => prev.map((p, i) => 
                    i === result.originalIndex ? { ...p, status: 'success' as const } : p
                  ))
                  uploaded.push({
                    id: result.existingId,
                    product_name: result.item.product_name,
                    branch_id: result.item.branch_id,
                    branch_name: selectedBranch?.name,
                    expiry_date: result.item.expiry_date,
                    quantity: result.item.quantity,
                    unit_price: result.item.unit_price,
                    status: 'success'
                  })
                  updated++
                } else {
                  updateProgress(prev => prev.map((p, i) => 
                    i === result.originalIndex ? { ...p, status: 'error' as const, error: result.error || 'Update failed' } : p
                  ))
                  errors.push({
                    product_name: result.item.product_name,
                    branch_id: result.item.branch_id,
                    branch_name: selectedBranch?.name,
                    expiry_date: result.item.expiry_date,
                    quantity: result.item.quantity,
                    unit_price: result.item.unit_price,
                    status: 'error',
                    error: result.error || 'Update failed'
                  })
                  failed++
                }
              })
            }

            // ✅ BATCH INSERT: Insert new items in batch
            if (itemsToInsert.length > 0) {
              const insertData = itemsToInsert.map(({ item }) => ({
                product_name: item.product_name,
                branch_id: item.branch_id,
                expiry_date: item.expiry_date,
                quantity: item.quantity,
                unit_price: item.unit_price,
                batch_number: item.batch_number || null // ✅ Include batch_number
              }))

              const { data: insertedData, error: insertError } = await supabase
                .from('stock_items')
                .insert(insertData)
                .select()

              if (insertError) {
                // If batch insert fails, try individual inserts
                for (let i = 0; i < itemsToInsert.length; i++) {
                  const { item, originalIndex } = itemsToInsert[i]
                  
                  try {
                    const { data: newItem, error: itemError } = await supabase
                      .from('stock_items')
                      .insert({
                        product_name: item.product_name,
                        branch_id: item.branch_id,
                        expiry_date: item.expiry_date,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        batch_number: item.batch_number || null // ✅ Include batch_number
                      })
                      .select()
                      .single()

                    if (itemError) {
                      throw itemError
                    }

                    updateProgress(prev => prev.map((p, idx) => 
                      idx === originalIndex ? { ...p, status: 'success' as const } : p
                    ))

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
                  } catch (itemError: unknown) {
                    const errorMessage = itemError instanceof Error ? itemError.message : 'Insert failed'
                    updateProgress(prev => prev.map((p, idx) => 
                      idx === originalIndex ? { ...p, status: 'error' as const, error: errorMessage } : p
                    ))
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
                }
              } else {
                // Batch insert succeeded
                if (insertedData) {
                  insertedData.forEach((data, idx) => {
                    const { item: originalItem, originalIndex } = itemsToInsert[idx]
                    
                    updateProgress(prev => prev.map((p, i) => 
                      i === originalIndex ? { ...p, status: 'success' as const } : p
                    ))

                    uploaded.push({
                      id: data?.id,
                      product_name: originalItem.product_name,
                      branch_id: originalItem.branch_id,
                      branch_name: selectedBranch?.name,
                      expiry_date: originalItem.expiry_date,
                      quantity: originalItem.quantity,
                      unit_price: originalItem.unit_price,
                      status: 'success'
                    })
                    inserted++
                  })
                }
              }
            }

            // Calculate upload speed and estimated time
            const elapsed = (Date.now() - startTime) / 1000
            const speed = batchEnd / elapsed
            setUploadSpeed(speed)
            
            const remaining = validItems.length - batchEnd
            const estimated = remaining / speed
            setEstimatedTimeRemaining(Math.ceil(estimated))

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Batch processing failed'
            
            // Mark all items in batch as error
            batch.forEach((item, idx) => {
              const originalIndex = batchStart + idx
              updateProgress(prev => prev.map((p, i) => 
                i === originalIndex ? { ...p, status: 'error' as const, error: errorMessage } : p
              ))
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
            })
          }

          // Small delay between batches to allow UI updates
          if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }

        // ✅ Store summary data
        setUploadedItemsSummary(uploaded)
        setErrorItemsSummary(errors)
        setDuplicateItemsSummary(duplicates)
        setReconcileStats({ inserted, updated, failed })

        // Close progress dialog
        setShowProgress(false)
        setLoading(false)
        hideOverlayImmediately()

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
      updateProgress(prev => prev.map(item => 
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
    setUploadError(null) // Clear any errors
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

      // ✅ Branch-scoped deletion: Always filter by selected branch (compartmentalized)
      if (!selectedBranch) {
        throw new Error('Please select a branch to delete stock items.')
      }

      let query = supabase
        .from('stock_items')
        .select('*')
        .eq('branch_id', selectedBranch.id) // ✅ Always filter by selected branch

      console.log('Fetching stock items...', `(branch: ${selectedBranch.name})`)
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

      // ✅ Delete movement history records first (branch-scoped)
      console.log('🗑️ Deleting movement history records first...')
      if (!selectedBranch) {
        throw new Error('Please select a branch to delete movement history.')
      }
      
      let movementDeleteQuery = supabase
        .from('stock_movement_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .eq('from_branch_id', selectedBranch.id) // ✅ Always filter by selected branch

      const { error: movementDeleteError } = await movementDeleteQuery

      if (movementDeleteError) {
        console.error('❌ Movement history delete error:', movementDeleteError)
        throw new Error(`Failed to delete movement history: ${movementDeleteError.message}`)
      } else {
        console.log('✅ Movement history records deleted successfully')
      }

      // ✅ Delete stock items (branch-scoped)
      console.log('🗑️ Attempting to delete stock items...', `(branch: ${selectedBranch.name})`)
      if (!selectedBranch) {
        throw new Error('Please select a branch to delete stock items.')
      }
      
      let deleteQuery = supabase
        .from('stock_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .eq('branch_id', selectedBranch.id) // ✅ Always filter by selected branch

      const { error: deleteError } = await deleteQuery

      console.log('🗑️ Delete operation result:', { deleteError, deletedCount: allItems?.length || 0 })

      if (deleteError) {
        console.error('❌ Delete error details:', deleteError)
        throw new Error(`Delete failed: ${deleteError.message}. You may not have permission to delete stock items.`)
      } else {
        console.log('✅ Delete operation successful!')
        deletedCount = allItems?.length || 0
      }

      // ✅ Delete weekly tasks (branch-scoped)
      console.log('🗑️ Attempting to delete weekly tasks...', `(branch: ${selectedBranch.name})`)
      if (!selectedBranch) {
        throw new Error('Please select a branch to delete weekly tasks.')
      }
      
      let weeklyTasksQuery = supabase
        .from('weekly_tasks')
        .select('*')
        .eq('branch_id', selectedBranch.id) // ✅ Always filter by selected branch

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
    <div className="space-y-8 relative">
      {/* Loading Overlay - Prevents black screen */}
      {/* Use portal to render at root level, always mounted for instant display */}
      {typeof document !== 'undefined' && createPortal(
        loading && (
          <div 
            className="fixed inset-0 bg-background/95 backdrop-blur-md z-[9999] flex items-center justify-center"
            style={{ 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99999,
              backgroundColor: 'rgba(0, 0, 0, 0.95)',
              willChange: 'opacity'
            }}
          >
            <div className="bg-card p-8 rounded-lg shadow-2xl border-2 max-w-md w-full mx-4">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Processing File...</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Please wait while we read and process your Excel file. This may take a moment.
                </p>
                <div className="w-full bg-secondary rounded-full h-2 mt-4">
                  <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                </div>
              </div>
            </div>
          </div>
        ),
        document.body
      )}
      
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
                      ⚠️ WARNING: This will permanently delete {totalStockItems} stock items AND weekly tasks from {selectedBranch?.name || 'selected branch'}.
                    </span>
                    <br /><br />
                    This action cannot be undone and will permanently remove all stock items and weekly tasks from {selectedBranch?.name || 'the selected branch'}.
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
            {/* Error Display */}
            {uploadError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <div>
                    <strong>Upload Error:</strong> {uploadError}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setUploadError(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            
            <p className="text-muted-foreground mb-4">
              Upload an Excel file with columns: product_name, branch, expiry_date, quantity, unit_price
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Note: Branch names must match existing branches in the system
            </p>
            <form 
              id="upload-form" 
              onSubmit={(e) => {
                console.log('📝 Form submitted')
                handleFileUpload(e)
              }} 
              className="space-y-4"
              noValidate
            >
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
                <Button 
                  type="submit" 
                  disabled={loading}
                  onClick={(e) => {
                    console.log('🔘 Button clicked directly', { file: !!file, selectedBranch: !!selectedBranch, loading })
                    // Trigger form submission if button is clicked directly
                    if (!file) {
                      e.preventDefault()
                      toast({
                        title: "Error",
                        description: "Please select a file first",
                        variant: "destructive",
                      })
                      return
                    }
                    if (!selectedBranch) {
                      e.preventDefault()
                      toast({
                        title: "Error",
                        description: "Please select a branch first",
                        variant: "destructive",
                      })
                      return
                    }
                    // Let the form submit normally
                  }}
                  title={
                    loading ? "Upload in progress..." :
                    !file ? "Please select a file first" : 
                    !selectedBranch ? "Please select a branch first" : 
                    "Click to upload stock items"
                  }
                  className={loading ? "opacity-50 cursor-not-allowed" : ""}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Stock Items
                    </>
                  )}
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
