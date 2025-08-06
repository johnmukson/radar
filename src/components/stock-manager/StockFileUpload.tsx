import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import * as XLSX from 'xlsx'

interface StockItem {
  id: string
  product_name: string
  branch_id: string
  branch_name?: string
  expiry_date: string
  quantity: number
  unit_price: number
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

interface StockFileUploadProps {
  onUpdatesReady: (updates: StockUpdate[]) => void
  onShowPreview: (show: boolean) => void
  existingItems: StockItem[]
}

interface Branch {
  id: string
  name: string
  code: string
}

const StockFileUpload = ({ onUpdatesReady, onShowPreview, existingItems }: StockFileUploadProps) => {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [processedData, setProcessedData] = useState<StockUpdate[]>([])
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFile(file)
    setLoading(true)

    try {
      const data = await readExcelFile(file)
      const updates = processStockData(data)
      
      setProcessedData(updates)
      onUpdatesReady(updates)
      onShowPreview(true)
      
      toast({
        title: "Success",
        description: `Processed ${updates.length} stock items from file`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to process file",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const clearUploadData = () => {
    setFile(null)
    setProcessedData([])
    onUpdatesReady([])
    onShowPreview(false)
    
    // Reset the file input
    const fileInput = document.getElementById('stock-file') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const readExcelFile = (file: File): Promise<Array<Record<string, unknown>>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet)
          resolve(jsonData as Array<Record<string, unknown>>)
        } catch (error) {
          reject(new Error('Invalid file format'))
        }
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  }

  const processStockData = (data: Array<Record<string, unknown>>): StockUpdate[] => {
    const updates: StockUpdate[] = []

    data.forEach((row, index) => {
      try {
        // Expected columns: Product Name, Branch, Expiry Date, Quantity, Unit Price
        const productName = row['Product Name'] || row['product_name'] || row['ProductName']
        const branchName = row['Branch'] || row['branch'] || row['BranchName']
        const expiryDate = row['Expiry Date'] || row['expiry_date'] || row['ExpiryDate']
        const quantity = parseInt(row['Quantity'] || row['quantity']) || 0
        const unitPrice = parseFloat(row['Unit Price'] || row['unit_price'] || row['UnitPrice']) || 0

        if (!productName || !branchName || !expiryDate) {
          console.warn(`Skipping row ${index + 1}: Missing required fields`)
          return
        }

        // Find branch by name
        const branch = branches.find(b => 
          b.name.toLowerCase() === branchName.toLowerCase()
        )

        if (!branch) {
          console.warn(`Skipping row ${index + 1}: Branch "${branchName}" not found`)
          return
        }

        // Check if item already exists
        const existingItem = existingItems.find(item => 
          item.product_name.toLowerCase() === productName.toLowerCase() &&
          item.branch_id === branch.id &&
          item.expiry_date === expiryDate
        )

        const update: StockUpdate = {
          product_name: productName,
          branch_id: branch.id,
          branch_name: branch.name,
          expiry_date: expiryDate,
          quantity,
          unit_price: unitPrice,
          action: existingItem ? 'update' : 'add',
          existing_id: existingItem?.id
        }

        updates.push(update)
      } catch (error) {
        console.warn(`Error processing row ${index + 1}:`, error)
      }
    })

    return updates
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="stock-file">Upload Stock Excel File</Label>
        <Input
          id="stock-file"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={loading}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Expected columns: Product Name, Branch, Expiry Date, Quantity, Unit Price
        </p>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Processing file...</p>
        </div>
      )}

      {processedData.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">
              Processed {processedData.length} items
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearUploadData}
              disabled={loading}
            >
              Clear Data
            </Button>
          </div>
          
          <div className="max-h-40 overflow-y-auto space-y-1">
            {processedData.slice(0, 5).map((item, index) => (
              <div key={index} className="text-xs p-2 bg-muted rounded">
                <span className="font-medium">{item.product_name}</span>
                <span className="text-muted-foreground ml-2">
                  {item.branch_name} - {item.action} - Qty: {item.quantity}
                </span>
              </div>
            ))}
            {processedData.length > 5 && (
              <div className="text-xs text-muted-foreground text-center">
                ... and {processedData.length - 5} more items
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        <p><strong>Instructions:</strong></p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Upload an Excel file with stock information</li>
          <li>File should have columns: Product Name, Branch, Expiry Date, Quantity, Unit Price</li>
          <li>Existing items will be updated, new items will be added</li>
          <li>Branch names must match existing branches in the system</li>
          <li>Use "Clear Data" to reset and upload a different file</li>
        </ul>
      </div>
    </div>
  )
}

export default StockFileUpload
