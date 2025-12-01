import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'

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

interface StockUpdatesPreviewProps {
  updates: StockUpdate[]
  loading: boolean
  onApply: () => void
  onCancel: () => void
}

const StockUpdatesPreview = ({ updates, loading, onApply, onCancel }: StockUpdatesPreviewProps) => {
  if (updates.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Updates Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {updates.map((update, index) => (
                <TableRow key={index}>
                  <TableCell>{update.product_name}</TableCell>
                  <TableCell>{update.branch_name || 'Unknown Branch'}</TableCell>
                  <TableCell>{format(new Date(update.expiry_date), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>{update.quantity}</TableCell>
                  <TableCell>USh {update.unit_price}</TableCell>
                  <TableCell>
                    <Badge variant={update.action === 'add' ? 'default' : 'secondary'}>
                      {update.action === 'add' ? 'Add New' : 'Update Quantity'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2">
            <Button onClick={onApply} disabled={loading}>
              {loading ? 'Applying...' : 'Apply All Updates'}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default StockUpdatesPreview
