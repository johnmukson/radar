import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, XCircle, AlertTriangle, Package, Filter, Clock, Building2, Info } from 'lucide-react'
import { validateStockItem, checkDuplicatesInBatch, ValidationReport, StockItemForValidation } from '@/utils/uploadValidation'
import { format } from 'date-fns'

interface Branch {
  id: string
  name: string
  code?: string
  region?: string
}

interface UploadPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: StockItemForValidation[]
  onConfirm: (validItems: StockItemForValidation[]) => void
  onCancel: () => void
  dbDuplicates?: Map<string, StockItemForValidation[]> // ✅ Database duplicates
  selectedBranch?: Branch | null // ✅ Branch information
  uploadMode?: 'insert' | 'reconcile' // ✅ Upload mode
}

const UploadPreviewDialog: React.FC<UploadPreviewDialogProps> = ({
  open,
  onOpenChange,
  items,
  onConfirm,
  onCancel,
  dbDuplicates = new Map(), // ✅ Database duplicates (default to empty map)
  selectedBranch = null, // ✅ Branch information
  uploadMode = 'insert' // ✅ Upload mode
}) => {
  const [filter, setFilter] = useState<'all' | 'valid' | 'invalid' | 'duplicates'>('all')
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set())

  // Validate all items
  const validationReports = useMemo(() => {
    return items.map((item, index) => {
      if (removedIndices.has(index)) return null
      return validateStockItem(item)
    }).filter((report): report is ValidationReport => report !== null)
  }, [items, removedIndices])

  // Check for duplicates in batch
  const batchDuplicates = useMemo(() => {
    const validItems = items.filter((_, index) => !removedIndices.has(index))
    return checkDuplicatesInBatch(validItems)
  }, [items, removedIndices])

  // ✅ Check for database duplicates
  const isDbDuplicate = useMemo(() => {
    const duplicateSet = new Set<string>()
    dbDuplicates.forEach((duplicateItems, key) => {
      duplicateItems.forEach(item => {
        const itemKey = `${item.product_name.toLowerCase().trim()}_${item.expiry_date}_${item.branch_id}`
        duplicateSet.add(itemKey)
      })
    })
    return duplicateSet
  }, [dbDuplicates])

  // Statistics
  const stats = useMemo(() => {
    const valid = validationReports.filter(r => {
      const key = `${r.item.product_name.toLowerCase().trim()}_${r.item.expiry_date}_${r.item.branch_id}`
      return r.overall.isValid && !batchDuplicates.has(key) && !isDbDuplicate.has(key)
    }).length
    const invalid = validationReports.filter(r => !r.overall.isValid).length
    const batchDupCount = Array.from(batchDuplicates.values()).flat().filter((indices, _, self) => {
      // Count unique items (not removed)
      return indices.some(idx => !removedIndices.has(idx))
    }).length
    const dbDupCount = Array.from(dbDuplicates.values()).flat().length
    const total = validationReports.length
    
    // ✅ Calculate total value of valid items
    const totalValue = validationReports
      .filter(r => {
        const key = `${r.item.product_name.toLowerCase().trim()}_${r.item.expiry_date}_${r.item.branch_id}`
        return r.overall.isValid && !batchDuplicates.has(key) && !isDbDuplicate.has(key)
      })
      .reduce((sum, r) => sum + (r.item.quantity * r.item.unit_price), 0)

    return {
      total,
      valid,
      invalid,
      duplicates: batchDupCount + dbDupCount, // ✅ Include both batch and database duplicates
      removed: removedIndices.size,
      totalValue // ✅ Total monetary value
    }
  }, [validationReports, batchDuplicates, dbDuplicates, isDbDuplicate, removedIndices])
  
  // ✅ Get validation error summary
  const validationErrorSummary = useMemo(() => {
    const errorMap = new Map<string, number>()
    validationReports.forEach(report => {
      if (!report.overall.isValid) {
        report.overall.errors.forEach(error => {
          errorMap.set(error, (errorMap.get(error) || 0) + 1)
        })
      }
    })
    return Array.from(errorMap.entries()).map(([error, count]) => ({ error, count }))
  }, [validationReports])
  
  // ✅ Get duplicate summary
  const duplicateSummary = useMemo(() => {
    const batchDupItems: string[] = []
    const dbDupItems: string[] = []
    
    validationReports.forEach(report => {
      const key = `${report.item.product_name.toLowerCase().trim()}_${report.item.expiry_date}_${report.item.branch_id}`
      if (batchDuplicates.has(key)) {
        batchDupItems.push(report.item.product_name)
      }
      if (isDbDuplicate.has(key)) {
        dbDupItems.push(report.item.product_name)
      }
    })
    
    return {
      batchDuplicates: Array.from(new Set(batchDupItems)),
      databaseDuplicates: Array.from(new Set(dbDupItems))
    }
  }, [validationReports, batchDuplicates, isDbDuplicate])
  
  // ✅ Calculate estimated upload time (average 0.1 seconds per item)
  const estimatedUploadTime = useMemo(() => {
    const validCount = stats.valid
    const avgTimePerItem = 0.1 // seconds
    const estimatedSeconds = Math.ceil(validCount * avgTimePerItem)
    
    if (estimatedSeconds < 60) {
      return `${estimatedSeconds} second${estimatedSeconds !== 1 ? 's' : ''}`
    } else {
      const minutes = Math.floor(estimatedSeconds / 60)
      const seconds = estimatedSeconds % 60
      return `${minutes} minute${minutes !== 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds !== 1 ? 's' : ''}` : ''}`
    }
  }, [stats.valid])

  // Filtered reports
  const filteredReports = useMemo(() => {
    return validationReports.filter((report) => {
      const key = `${report.item.product_name.toLowerCase().trim()}_${report.item.expiry_date}_${report.item.branch_id}`
      const isBatchDuplicate = batchDuplicates.has(key)
      const isDbDup = isDbDuplicate.has(key)
      const isDuplicate = isBatchDuplicate || isDbDup
      
      // Check if this item was removed
      const itemIndex = items.findIndex(item => 
        item.product_name === report.item.product_name &&
        item.expiry_date === report.item.expiry_date &&
        item.branch_id === report.item.branch_id
      )
      if (itemIndex !== -1 && removedIndices.has(itemIndex)) return false

      switch (filter) {
        case 'valid':
          return report.overall.isValid && !isDuplicate
        case 'invalid':
          return !report.overall.isValid
        case 'duplicates':
          return isDuplicate
        default:
          return true
      }
    })
  }, [validationReports, filter, batchDuplicates, isDbDuplicate, removedIndices, items])

  const handleRemove = (index: number) => {
    setRemovedIndices(prev => new Set([...prev, index]))
  }

  const handleConfirm = () => {
    const validItems = items.filter((item, index) => {
      if (removedIndices.has(index)) return false
      const report = validationReports.find(r => 
        r.item.product_name === item.product_name &&
        r.item.expiry_date === item.expiry_date &&
        r.item.branch_id === item.branch_id
      )
      if (!report) return false
      const key = `${item.product_name.toLowerCase().trim()}_${item.expiry_date}_${item.branch_id}`
      return report.overall.isValid && !batchDuplicates.has(key) && !isDbDuplicate.has(key)
    })
    onConfirm(validItems)
    onOpenChange(false)
  }

  const getStatusBadge = (report: ValidationReport, isDuplicate: boolean, isDbDup: boolean = false) => {
    if (isDbDup) {
      return <Badge variant="destructive" className="bg-orange-500">DB Duplicate</Badge>
    }
    if (isDuplicate) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Duplicate</Badge>
    }
    if (report.overall.isValid) {
      return <Badge variant="outline" className="bg-green-100 text-green-800">Valid</Badge>
    }
    return <Badge variant="outline" className="bg-red-100 text-red-800">Invalid</Badge>
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Upload Confirmation & Preview
          </DialogTitle>
          <DialogDescription>
            Review and validate your data before uploading. Remove invalid items or fix them before proceeding.
          </DialogDescription>
        </DialogHeader>

        {/* ✅ Detailed Summary Section */}
        <div className="space-y-4">
          {/* Branch Confirmation */}
          {selectedBranch && (
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <Building2 className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900 dark:text-blue-100">
                <div className="font-semibold mb-1">Branch Assignment:</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-100 text-blue-800">
                    {selectedBranch.name}
                  </Badge>
                  {selectedBranch.code && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      {selectedBranch.code}
                    </Badge>
                  )}
                  {selectedBranch.region && (
                    <span className="text-sm text-muted-foreground">({selectedBranch.region})</span>
                  )}
                </div>
                <div className="text-xs mt-2 text-muted-foreground">
                  All items will be assigned to this branch automatically.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Upload Mode */}
          {uploadMode && (
            <Alert className="bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
              <Info className="h-4 w-4 text-purple-600" />
              <AlertDescription className="text-purple-900 dark:text-purple-100">
                <div className="font-semibold">Upload Mode: {uploadMode === 'insert' ? 'Insert New Items' : 'Reconcile (Update Existing)'}</div>
                {uploadMode === 'reconcile' && (
                  <div className="text-xs mt-1">
                    Existing items will be updated (quantities added), new items will be inserted.
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Statistics Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-sm text-muted-foreground">Total Items</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="text-sm text-muted-foreground">Valid</div>
              <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
              {stats.valid > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Value: {stats.totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </div>
              )}
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <div className="text-sm text-muted-foreground">Invalid</div>
              <div className="text-2xl font-bold text-red-600">{stats.invalid}</div>
            </div>
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="text-sm text-muted-foreground">Duplicates</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.duplicates}</div>
            </div>
          </div>

          {/* Estimated Upload Time */}
          {stats.valid > 0 && (
            <Alert className="bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800">
              <Clock className="h-4 w-4 text-indigo-600" />
              <AlertDescription className="text-indigo-900 dark:text-indigo-100">
                <div className="font-semibold">Estimated Upload Time:</div>
                <div className="text-sm mt-1">
                  Approximately <strong>{estimatedUploadTime}</strong> to upload {stats.valid} item{stats.valid !== 1 ? 's' : ''}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ✅ Enhanced Validation Error Summary */}
        {stats.invalid > 0 && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-2">
                {stats.invalid} item(s) have validation errors and will be skipped:
              </div>
              <div className="space-y-1 text-sm">
                {validationErrorSummary.slice(0, 5).map(({ error, count }, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span>• {error}</span>
                    <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">
                      {count} item{count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                ))}
                {validationErrorSummary.length > 5 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    +{validationErrorSummary.length - 5} more error type{validationErrorSummary.length - 5 !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* ✅ Enhanced Duplicate Warning Summary */}
        {stats.duplicates > 0 && (
          <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-900 dark:text-yellow-100">
              <div className="font-semibold mb-2">
                {stats.duplicates} duplicate item(s) detected and will be skipped:
              </div>
              <div className="space-y-2 text-sm">
                {duplicateSummary.batchDuplicates.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">In-batch duplicates ({duplicateSummary.batchDuplicates.length}):</div>
                    <div className="flex flex-wrap gap-1">
                      {duplicateSummary.batchDuplicates.slice(0, 5).map((name, index) => (
                        <Badge key={index} variant="outline" className="bg-yellow-100 text-yellow-800 text-xs">
                          {name}
                        </Badge>
                      ))}
                      {duplicateSummary.batchDuplicates.length > 5 && (
                        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 text-xs">
                          +{duplicateSummary.batchDuplicates.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {duplicateSummary.databaseDuplicates.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Database duplicates ({duplicateSummary.databaseDuplicates.length}):</div>
                    <div className="flex flex-wrap gap-1">
                      {duplicateSummary.databaseDuplicates.slice(0, 5).map((name, index) => (
                        <Badge key={index} variant="outline" className="bg-orange-100 text-orange-800 text-xs">
                          {name}
                        </Badge>
                      ))}
                      {duplicateSummary.databaseDuplicates.length > 5 && (
                        <Badge variant="outline" className="bg-orange-100 text-orange-800 text-xs">
                          +{duplicateSummary.databaseDuplicates.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="valid">Valid ({stats.valid})</TabsTrigger>
            <TabsTrigger value="invalid">Invalid ({stats.invalid})</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicates ({stats.duplicates})</TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No items to display
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReports.map((report, reportIndex) => {
                      const key = `${report.item.product_name.toLowerCase().trim()}_${report.item.expiry_date}_${report.item.branch_id}`
                      const isBatchDuplicate = batchDuplicates.has(key)
                      const isDbDup = isDbDuplicate.has(key) // ✅ Check database duplicates
                      const isDuplicate = isBatchDuplicate || isDbDup
                      // Find original index in items array
                      const originalIndex = items.findIndex((item, idx) => 
                        !removedIndices.has(idx) &&
                        item.product_name === report.item.product_name &&
                        item.expiry_date === report.item.expiry_date &&
                        item.branch_id === report.item.branch_id
                      )

                      return (
                        <TableRow key={`${reportIndex}-${report.item.product_name}-${report.item.expiry_date}`} className={!report.overall.isValid ? 'bg-red-50' : isDuplicate ? 'bg-yellow-50' : ''}>
                          <TableCell>
                            {getStatusBadge(report, isDuplicate, isDbDup)}
                          </TableCell>
                          <TableCell className="font-medium">{report.item.product_name}</TableCell>
                          <TableCell>{report.item.quantity}</TableCell>
                          <TableCell>{report.item.unit_price.toFixed(2)}</TableCell>
                          <TableCell>{format(new Date(report.item.expiry_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            {report.overall.errors.length > 0 && (
                              <div className="text-xs text-red-600">
                                {report.overall.errors.slice(0, 2).map((err, i) => (
                                  <div key={i}>• {err}</div>
                                ))}
                                {report.overall.errors.length > 2 && (
                                  <div>+{report.overall.errors.length - 2} more</div>
                                )}
                              </div>
                            )}
                            {report.overall.warnings.length > 0 && !report.overall.errors.length && (
                              <div className="text-xs text-yellow-600">
                                {report.overall.warnings.slice(0, 1).map((warn, i) => (
                                  <div key={i}>⚠ {warn}</div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {(!report.overall.isValid || isDuplicate) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemove(originalIndex)}
                                className="text-red-600 hover:text-red-700"
                              >
                                Remove
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {stats.valid > 0 && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Estimated time: {estimatedUploadTime}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              onCancel()
              onOpenChange(false)
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={stats.valid === 0}
              className="min-w-[140px]"
            >
              {uploadMode === 'reconcile' ? 'Reconcile' : 'Upload'} {stats.valid} Item{stats.valid !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default UploadPreviewDialog

