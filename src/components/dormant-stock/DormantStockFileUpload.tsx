import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import * as XLSX from 'xlsx'

interface DormantStockItem {
  product_id: number
  product_name: string
  excess_value: number
  excess_qty: number
  sales: number
  days: number
  classification: string
}


interface DormantStockFileUploadProps {
  onUploadComplete?: () => void
}

const DormantStockFileUpload: React.FC<DormantStockFileUploadProps> = ({ onUploadComplete }) => {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [processedData, setProcessedData] = useState<DormantStockItem[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const { toast } = useToast()



  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return


    setFile(file)
    setLoading(true)

    try {
      const data = await readExcelFile(file)
      const processedItems = processDormantStockData(data)
      
      setProcessedData(processedItems)
      setShowPreview(true)
      
      toast({
        title: "Success",
        description: `Processed ${processedItems.length} dormant stock items from file`,
      })

      // Automatically upload after successful processing
      await uploadToDatabase(processedItems)
      
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

  const readExcelFile = (file: File): Promise<Array<Record<string, unknown>>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const result = e.target?.result
          
          // Check if it's an Excel file
          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const workbook = XLSX.read(result, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
            
            if (jsonData.length < 2) {
              reject(new Error('File must contain at least a header row and one data row'))
              return
            }

            const headers = jsonData[0] as string[]
            const rows = jsonData.slice(1).map((row: any[]) => {
              const rowObj: Record<string, unknown> = {}
              headers.forEach((header, i) => {
                rowObj[header] = row[i] || ''
              })
              return rowObj
            }).filter(row => 
              Object.values(row).some(value => value !== '' && value !== null && value !== undefined)
            )
            
            if (rows.length === 0) {
              reject(new Error('No data rows found in file'))
              return
            }
            
            resolve(rows)
            return
          }

          // Handle text-based files (CSV, TSV, TXT)
          const data = result as string
          const lines = data.split('\n').filter(line => line.trim() !== '')
          
          if (lines.length < 2) {
            reject(new Error('File must contain at least a header row and one data row'))
            return
          }

          // Detect delimiter (tab, comma, or semicolon)
          const firstLine = lines[0]
          let delimiter = '\t'
          if (firstLine.includes(',')) delimiter = ','
          else if (firstLine.includes(';')) delimiter = ';'

          const headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''))
          
          const rows = lines.slice(1).map((line, index) => {
            const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''))
            const row: Record<string, unknown> = {}
            headers.forEach((header, i) => {
              row[header] = values[i] || ''
            })
            return row
          }).filter(row => 
            // Only include rows that have at least some data
            Object.values(row).some(value => value !== '' && value !== null && value !== undefined)
          )
          
          if (rows.length === 0) {
            reject(new Error('No data rows found in file'))
            return
          }
          
          resolve(rows)
        } catch (error) {
          reject(new Error(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`))
        }
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      
      // Handle different file types
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Handle Excel files
        reader.readAsArrayBuffer(file)
      } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8')
      } else if (file.type === 'text/tab-separated-values' || file.name.endsWith('.tsv')) {
        reader.readAsText(file, 'UTF-8')
      } else if (file.name.endsWith('.txt')) {
        reader.readAsText(file, 'UTF-8')
      } else {
        reader.readAsText(file, 'UTF-8')
      }
    })
  }

  const processDormantStockData = (data: Array<Record<string, unknown>>): DormantStockItem[] => {
    const errors: string[] = []
    const processedItems: DormantStockItem[] = []

    // Log file structure info
    if (data.length > 0) {
      console.log('Found headers:', Object.keys(data[0]))
      console.log('Found headers count:', Object.keys(data[0]).length)
      console.log('Expected headers:', ['ID', 'Product Name', 'Excess Value', 'Excess Qty', 'Sales', 'Days', 'Classification'])
      console.log('Expected headers count:', 7)
      console.log('Total data rows:', data.length)
    }

    data.forEach((row, index) => {
      try {
        // Handle different possible column names with case-insensitive matching
        const getValue = (possibleKeys: string[]) => {
          for (const key of possibleKeys) {
            const found = Object.keys(row).find(k => 
              k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
            )
            if (found && row[found] !== undefined && row[found] !== '') {
              return row[found]
            }
          }
          return null
        }

        // More flexible column detection
        const productId = getValue(['ID', 'id', 'Product ID', 'product_id', 'ProductId']) || index + 1
        const productName = getValue(['Product Name', 'product_name', 'Name', 'name', 'Product', 'ProductName', 'productname'])
        const excessValue = getValue(['Excess Value', 'excess_value', 'Value', 'value', 'ExcessValue', 'excessvalue'])
        const excessQty = getValue(['Excess Qty', 'excess_qty', 'Quantity', 'quantity', 'Qty', 'qty', 'ExcessQty', 'excessqty'])
        const salesRaw = getValue(['Sales', 'sales']) || 0
        const daysRaw = getValue(['Days', 'days'])
        
        // Handle "0 No Sales" text values
        const sales = typeof salesRaw === 'string' && salesRaw.includes('No Sales') ? 0 : salesRaw
        const days = typeof daysRaw === 'string' && daysRaw.includes('No Sales') ? 0 : daysRaw
        const classification = getValue(['Classification', 'classification', 'Type', 'type', 'Class', 'Classification'])

        // Debug: Log the first few rows to see what data we have
        if (index < 3) {
          console.log(`Row ${index + 1} data:`, row)
          console.log(`Row ${index + 1} data keys:`, Object.keys(row))
          console.log(`Row ${index + 1} parsed values:`, {
            productId,
            productName,
            excessValue,
            excessQty,
            sales,
            days,
            classification
          })
        }

        // More lenient validation - skip rows that are completely empty
        const hasAnyData = productName || excessValue || excessQty || days || classification
        
        if (!hasAnyData) {
          // Skip completely empty rows
          return
        }

        // Use fallback values for missing data instead of strict validation
        const finalProductName = productName ? String(productName).trim() : `Product ${index + 1}`
        
        if (!finalProductName || finalProductName === '') {
          errors.push(`Row ${index + 1}: Product name is required (found columns: ${Object.keys(row).join(', ')})`)
          return
        }

        const excessValueNum = excessValue ? Number(excessValue) : 0
        if (isNaN(excessValueNum) || excessValueNum < 0) {
          errors.push(`Row ${index + 1}: Valid excess value is required (got: ${excessValue})`)
          return
        }

        const excessQtyNum = excessQty ? Number(excessQty) : 0
        if (isNaN(excessQtyNum) || excessQtyNum < 0) {
          errors.push(`Row ${index + 1}: Valid excess quantity is required (got: ${excessQty})`)
          return
        }

        const daysNum = days !== null && days !== undefined ? Number(days) : 0
        if (isNaN(daysNum) || daysNum < 0) {
          errors.push(`Row ${index + 1}: Valid days value is required (got: ${days})`)
          return
        }

        // Parse classification from combined field like "60 OTC" or "90 POM"
        let finalClassification = 'OTC'
        let finalDays = days
        if (classification && typeof classification === 'string') {
          const classStr = classification.toString().trim()
          
          // Handle format like "60 OTC" where days and classification are combined
          const daysMatch = classStr.match(/^(\d+)\s+(.+)$/)
          if (daysMatch) {
            finalDays = parseInt(daysMatch[1]) || days
            const classificationPart = daysMatch[2].toUpperCase()
            
            if (classificationPart.includes('POM/OTC') || classificationPart.includes('POM-OTC')) {
              finalClassification = 'POM/OTC'
            } else if (classificationPart.includes('POM')) {
              finalClassification = 'POM'
            } else if (classificationPart.includes('OTC')) {
              finalClassification = 'OTC'
            }
          } else {
            // Handle standalone classification
            const classStrUpper = classStr.toUpperCase()
            if (classStrUpper.includes('POM/OTC') || classStrUpper.includes('POM-OTC')) {
              finalClassification = 'POM/OTC'
            } else if (classStrUpper.includes('POM')) {
              finalClassification = 'POM'
            } else if (classStrUpper.includes('OTC')) {
              finalClassification = 'OTC'
            }
          }
        }

        const salesNum = typeof sales === 'number' ? sales : (typeof sales === 'string' && sales.includes('No Sales') ? 0 : parseInt(String(sales)) || 0)
        
        const processedItem: DormantStockItem = {
          product_id: typeof productId === 'number' ? productId : parseInt(String(productId)) || index + 1,
          product_name: finalProductName,
          excess_value: excessValueNum,
          excess_qty: excessQtyNum,
          sales: salesNum,
          days: typeof finalDays === 'number' ? finalDays : daysNum,
          classification: finalClassification
        }

        processedItems.push(processedItem)
      } catch (error) {
        errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })

    console.log('Processing summary:', {
      totalRows: data.length,
      processedItems: processedItems.length,
      errors: errors.length,
      firstFewErrors: errors.slice(0, 5)
    })
    console.log('Sample of first 3 data rows:', data.slice(0, 3))

    if (errors.length > 0) {
      console.error('Validation errors:', errors)
      throw new Error(`Validation errors found:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''}`)
    }

    if (processedItems.length === 0) {
      console.error('No processed items found. Data sample:', data.slice(0, 3))
      throw new Error('No valid data found in the file')
    }

    return processedItems
  }

  const uploadToDatabase = async (dataToUpload?: DormantStockItem[]) => {
    const itemsToUpload = dataToUpload || processedData
    
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const itemsToInsert = itemsToUpload.map(item => ({
        ...item,
        uploaded_by: user?.id
      }))

      const { error } = await supabase
        .from('dormant_stock')
        .insert(itemsToInsert)

      if (error) {
        // Handle specific database errors
        if (error.message.includes('relation "dormant_stock" does not exist')) {
          toast({
            title: "Database Error",
            description: "The dormant_stock table doesn't exist. Please run the database migration first.",
            variant: "destructive",
          })
          return
        }
        throw error
      }

      toast({
        title: "Success",
        description: `Successfully uploaded ${itemsToInsert.length} dormant stock items to database`,
      })

      // Reset form
      setFile(null)
      setProcessedData([])
      setShowPreview(false)
      const fileInput = document.getElementById('dormant-stock-file') as HTMLInputElement
      if (fileInput) {
        fileInput.value = ''
      }

      onUploadComplete?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Upload error:', error)
      toast({
        title: "Error",
        description: message || "Failed to upload data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const clearUploadData = () => {
    setFile(null)
    setProcessedData([])
    setShowPreview(false)
    
    const fileInput = document.getElementById('dormant-stock-file') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Dormant Stock Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Expected columns:</strong> ID, Product Name, Excess Value, Excess Qty, Sales, Days, Classification
              <br />
              <strong>Supported formats:</strong> CSV, TSV, TXT, Excel files
              <br />
              <strong>Note:</strong> Classification can be in format "60 OTC" or just "OTC"
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="dormant-stock-file">Upload File *</Label>
            <Input
              id="dormant-stock-file"
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={loading}
              className="cursor-pointer"
            />
            <p className="text-sm text-muted-foreground">
              Choose a CSV, TSV, TXT, or Excel file with dormant stock data
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 p-4 border rounded-lg bg-muted/50">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm font-medium">Processing file...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {showPreview && processedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview ({processedData.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Data has been automatically uploaded to the database. You can review it below or re-upload if needed.
              </AlertDescription>
            </Alert>

            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">Product Name</th>
                    <th className="text-left p-2">Excess Value</th>
                    <th className="text-left p-2">Excess Qty</th>
                    <th className="text-left p-2">Sales</th>
                    <th className="text-left p-2">Days</th>
                    <th className="text-left p-2">Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {processedData.slice(0, 10).map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2">{item.product_id}</td>
                      <td className="p-2 max-w-xs truncate" title={item.product_name}>
                        {item.product_name}
                      </td>
                      <td className="p-2">{item.excess_value}</td>
                      <td className="p-2">{item.excess_qty}</td>
                      <td className="p-2">{item.sales}</td>
                      <td className="p-2">{item.days}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.classification === 'POM' ? 'bg-red-100 text-red-800' :
                          item.classification === 'POM/OTC' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.classification}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {processedData.length > 10 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing first 10 items of {processedData.length} total
                </p>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Button onClick={() => uploadToDatabase()} disabled={loading}>
                {loading ? 'Uploading...' : `Re-upload ${processedData.length} Items`}
              </Button>
              <Button variant="outline" onClick={clearUploadData} disabled={loading}>
                Clear Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default DormantStockFileUpload
