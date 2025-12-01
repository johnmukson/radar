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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertCircle, RotateCcw, Eye, Download, X } from 'lucide-react'
import { format } from 'date-fns'

export interface UploadedItem {
  id?: string
  product_name: string
  branch_id: string
  branch_name?: string
  expiry_date: string
  quantity: number
  unit_price: number
  status: 'success' | 'error' | 'duplicate'
  error?: string
}

interface PostUploadSummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  uploadedItems: UploadedItem[]
  errorItems: UploadedItem[]
  duplicateItems: UploadedItem[]
  totalItems: number
  onRollback: () => void
  onViewItems: () => void
  isRollingBack: boolean
  uploadMode: 'insert' | 'reconcile'
  reconcileStats?: {
    inserted: number
    updated: number
    failed: number
  }
}

const PostUploadSummaryDialog: React.FC<PostUploadSummaryDialogProps> = ({
  open,
  onOpenChange,
  uploadedItems,
  errorItems,
  duplicateItems,
  totalItems,
  onRollback,
  onViewItems,
  isRollingBack,
  uploadMode,
  reconcileStats
}) => {
  const [showDetails, setShowDetails] = useState(false)
  const [filter, setFilter] = useState<'all' | 'success' | 'errors' | 'duplicates'>('all')

  const successCount = uploadedItems.length
  const errorCount = errorItems.length
  const duplicateCount = duplicateItems.length
  const totalProcessed = successCount + errorCount + duplicateCount

  const filteredItems = useMemo(() => {
    if (filter === 'success') return uploadedItems
    if (filter === 'errors') return errorItems
    if (filter === 'duplicates') return duplicateItems
    return [...uploadedItems, ...errorItems, ...duplicateItems]
  }, [filter, uploadedItems, errorItems, duplicateItems])

  // ✅ Rollback only available for insert mode (not reconcile, as it updates existing items)
  const canRollback = successCount > 0 && !isRollingBack && uploadMode === 'insert'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {errorCount > 0 ? (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            Upload Summary
          </DialogTitle>
          <DialogDescription>
            {totalProcessed} of {totalItems} items processed
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Statistics Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-900 dark:text-green-100">Success</span>
              </div>
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
              {uploadMode === 'reconcile' && reconcileStats && (
                <div className="text-xs text-green-700 dark:text-green-300 mt-1">
                  {reconcileStats.inserted} inserted, {reconcileStats.updated} updated
                </div>
              )}
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-900 dark:text-red-100">Errors</span>
              </div>
              <div className="text-2xl font-bold text-red-600">{errorCount}</div>
            </div>
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Duplicates</span>
              </div>
              <div className="text-2xl font-bold text-yellow-600">{duplicateCount}</div>
            </div>
          </div>

          {/* Summary Message */}
          {errorCount === 0 && duplicateCount === 0 && (
            <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900 dark:text-green-100">
                All {successCount} items were uploaded successfully!
              </AlertDescription>
            </Alert>
          )}

          {errorCount > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {errorCount} item(s) failed to upload. Check the details below.
              </AlertDescription>
            </Alert>
          )}

          {duplicateCount > 0 && (
            <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-900 dark:text-yellow-100">
                {duplicateCount} duplicate item(s) were skipped.
              </AlertDescription>
            </Alert>
          )}

          {/* Filter Tabs */}
          {(errorCount > 0 || duplicateCount > 0) && (
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  filter === 'all'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({totalProcessed})
              </button>
              {successCount > 0 && (
                <button
                  onClick={() => setFilter('success')}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    filter === 'success'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Success ({successCount})
                </button>
              )}
              {errorCount > 0 && (
                <button
                  onClick={() => setFilter('errors')}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    filter === 'errors'
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Errors ({errorCount})
                </button>
              )}
              {duplicateCount > 0 && (
                <button
                  onClick={() => setFilter('duplicates')}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    filter === 'duplicates'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Duplicates ({duplicateCount})
                </button>
              )}
            </div>
          )}

          {/* Items List */}
          {showDetails && filteredItems.length > 0 && (
            <div className="border rounded-md max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    {filter === 'errors' && <TableHead>Error</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, index) => (
                    <TableRow
                      key={index}
                      className={
                        item.status === 'error'
                          ? 'bg-red-50 dark:bg-red-950'
                          : item.status === 'duplicate'
                          ? 'bg-yellow-50 dark:bg-yellow-950'
                          : ''
                      }
                    >
                      <TableCell>
                        {item.status === 'success' && (
                          <Badge variant="outline" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Success
                          </Badge>
                        )}
                        {item.status === 'error' && (
                          <Badge variant="outline" className="bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                        )}
                        {item.status === 'duplicate' && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Duplicate
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.unit_price.toFixed(2)}</TableCell>
                      <TableCell>{format(new Date(item.expiry_date), 'MMM dd, yyyy')}</TableCell>
                      {filter === 'errors' && item.error && (
                        <TableCell className="text-xs text-red-600" title={item.error}>
                          {item.error.length > 50 ? `${item.error.substring(0, 50)}...` : item.error}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              <Eye className="h-4 w-4 mr-2" />
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
            <div className="flex gap-2">
              {canRollback && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRollback}
                  disabled={isRollingBack}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  {isRollingBack ? (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                      Rolling Back...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Rollback Upload ({successCount} items)
                    </>
                  )}
                </Button>
              )}
              {uploadMode === 'reconcile' && (
                <div className="text-xs text-muted-foreground">
                  Rollback not available for reconcile mode
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onViewItems}
              >
                View Uploaded Items
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={() => {
              onOpenChange(false)
              // Optionally clear form if all items succeeded
              if (errorCount === 0 && duplicateCount === 0) {
                // Form will be cleared by parent component
              }
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PostUploadSummaryDialog

