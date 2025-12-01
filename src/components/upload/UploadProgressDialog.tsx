import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, Loader2, X, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

export interface UploadProgressItem {
  index: number
  product_name: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface UploadProgressDialogProps {
  open: boolean
  totalItems: number
  currentItem: number
  progressItems: UploadProgressItem[]
  uploadSpeed: number // items per second
  estimatedTimeRemaining: number // seconds
  onCancel: () => void
  isCancelling: boolean
}

const UploadProgressDialog: React.FC<UploadProgressDialogProps> = ({
  open,
  totalItems,
  currentItem,
  progressItems,
  uploadSpeed,
  estimatedTimeRemaining,
  onCancel,
  isCancelling
}) => {
  const [startTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    if (!open) return

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [open, startTime])

  const progressPercentage = totalItems > 0 ? (currentItem / totalItems) * 100 : 0
  const successCount = progressItems.filter(item => item.status === 'success').length
  const errorCount = progressItems.filter(item => item.status === 'error').length
  const pendingCount = progressItems.filter(item => item.status === 'pending').length
  const uploadingCount = progressItems.filter(item => item.status === 'uploading').length

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className={`h-5 w-5 ${uploadingCount > 0 ? 'animate-spin' : ''}`} />
            Uploading Stock Items
          </DialogTitle>
          <DialogDescription>
            Uploading {currentItem} of {totalItems} items
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {progressPercentage.toFixed(1)}% Complete
              </span>
              <span className="text-muted-foreground">
                {uploadSpeed > 0 ? `${uploadSpeed.toFixed(1)} items/sec` : 'Calculating...'}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Elapsed: {formatTime(elapsedTime)}</span>
              {estimatedTimeRemaining > 0 && (
                <span>Remaining: ~{formatTime(estimatedTimeRemaining)}</span>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
              <div className="text-2xl font-bold text-blue-600">{uploadingCount}</div>
              <div className="text-xs text-muted-foreground">Uploading</div>
            </div>
            <div className="p-2 bg-green-50 dark:bg-green-950 rounded-md">
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
              <div className="text-xs text-muted-foreground">Success</div>
            </div>
            <div className="p-2 bg-red-50 dark:bg-red-950 rounded-md">
              <div className="text-2xl font-bold text-red-600">{errorCount}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-md">
              <div className="text-2xl font-bold text-gray-600">{pendingCount}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </div>

          {/* Current Item Status */}
          {uploadingCount > 0 && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Currently uploading: {progressItems.find(item => item.status === 'uploading')?.product_name || 'Processing...'}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Summary */}
          {errorCount > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorCount} item(s) failed to upload. Check the list below for details.
              </AlertDescription>
            </Alert>
          )}

          {/* Item List (Scrollable) */}
          <div className="max-h-[300px] overflow-y-auto border rounded-md">
            <div className="divide-y">
              {progressItems.map((item) => (
                <div
                  key={item.index}
                  className={`p-3 flex items-center justify-between ${
                    item.status === 'error' ? 'bg-red-50 dark:bg-red-950' :
                    item.status === 'success' ? 'bg-green-50 dark:bg-green-950' :
                    item.status === 'uploading' ? 'bg-blue-50 dark:bg-blue-950' :
                    'bg-gray-50 dark:bg-gray-950'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {item.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    )}
                    {item.status === 'error' && (
                      <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    )}
                    {item.status === 'uploading' && (
                      <Loader2 className="h-4 w-4 text-blue-600 animate-spin flex-shrink-0" />
                    )}
                    {item.status === 'pending' && (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{item.product_name}</span>
                  </div>
                  {item.status === 'error' && item.error && (
                    <span className="text-xs text-red-600 ml-2 flex-shrink-0" title={item.error}>
                      {item.error.length > 30 ? `${item.error.substring(0, 30)}...` : item.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Cancel Button */}
          {!isCancelling && (uploadingCount > 0 || pendingCount > 0) && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isCancelling}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel Upload
              </Button>
            </div>
          )}

          {isCancelling && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Cancelling upload... Please wait.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UploadProgressDialog

