import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  Shield, 
  Search,
  Package,
  Users,
  Shuffle,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { format, isAfter, endOfMonth, parseISO } from 'date-fns'
import { isExpired } from '@/utils/expiryUtils'
import { extractErrorMessage } from '@/lib/utils'

const RISK_PRIORITY = ['critical', 'high', 'medium', 'low']

interface StockItem {
  id: string;
  product_name: string;
  expiry_date: string;
  risk_level?: string;
  quantity: number;
  unit_price: number;
  branch: string;
}

interface Dispenser {
  id: string;
  dispenser: string;
  role: string;
}

interface Assignment {
  dispenser_id: string;
  dispenser_name: string;
  month: string;
  risk: string;
  item: StockItem;
}

const Assignments = () => {
  const { user, signOut } = useAuth()
  const { hasAdminAccess, loading: roleLoading } = useUserRole()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [riskCategory, setRiskCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [riskLevelFilter, setRiskLevelFilter] = useState('all')
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch stock items
      const { data: items, error: itemsError } = await supabase
        .from('stock_items')
        .select('*')
      if (itemsError) throw itemsError
      
      // IMMUTABLE LAW: Exclude expired items from assignments
      // Expired items should only be managed in Expiry Manager
      const nonExpiredItems = (items || []).filter(item => !isExpired(item.expiry_date))
      setStockItems(nonExpiredItems)
      
      // Fetch dispensers
      const { data: disp, error: dispError } = await supabase
        .from('users_with_roles')
        .select('user_id, name')
        .eq('role', 'dispenser')
      if (dispError) throw dispError
      setDispensers((disp || []).map(d => ({ id: d.user_id, dispenser: d.name, role: 'dispenser' })))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch data')
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // Delete all stock items
  const handleDeleteAllStock = async () => {
    if (!confirm('Are you sure you want to delete ALL stock items? This action cannot be undone.')) {
      return
    }
    
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('stock_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all except dummy record

      if (error) throw error

      toast({ 
        title: 'Success', 
        description: 'All stock items have been deleted from the database' 
      })
      
      // Refresh data
      fetchData()
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to delete stock items')
      toast({ 
        title: 'Error', 
        description: errorMessage, 
        variant: 'destructive' 
      })
    } finally {
      setDeleting(false)
    }
  }

  // Assignment logic
  const handleEqualDistribution = () => {
    if (dispensers.length === 0 || stockItems.length === 0) {
      toast({ title: 'Error', description: 'No dispensers or stock items available', variant: 'destructive' })
      return
    }
    // Group items by month and risk category
    const grouped: Record<string, Record<string, StockItem[]>> = {}
    stockItems.forEach(item => {
      const month = format(new Date(item.expiry_date), 'yyyy-MM')
      const risk = (item.risk_level || 'low').toLowerCase()
      if (!grouped[month]) grouped[month] = {}
      if (!grouped[month][risk]) grouped[month][risk] = []
      grouped[month][risk].push(item)
    })
    // Assignment result
    const result: Assignment[] = []
    // For each month, assign by risk priority
    Object.keys(grouped).sort().forEach(month => {
      RISK_PRIORITY.forEach(risk => {
        const items = grouped[month][risk] || []
        // Distribute items equally among dispensers
        let idx = 0
        items.forEach(item => {
          const dispenser = dispensers[idx % dispensers.length]
          result.push({
            dispenser_id: dispenser.id,
            dispenser_name: dispenser.dispenser,
            month,
            risk,
            item,
          })
          idx++
        })
      })
    })
    setAssignments(result)
    toast({ title: 'Assignments Generated', description: `${result.length} assignments created (not yet saved)` })
  }

  // Save assignments to weekly_tasks
  const handleSaveAssignments = async () => {
    if (assignments.length === 0) {
      toast({ title: 'Nothing to save', description: 'No assignments to save', variant: 'destructive' })
      return
    }
    setAssigning(true)
    try {
      // For each assignment, create a weekly_tasks row
      const inserts = assignments.map(a => ({
        title: `Move ${a.item.product_name}`,
        description: `Move ${a.item.product_name} (Risk: ${a.risk}, Expiry: ${a.item.expiry_date})`,
        assigned_to: a.dispenser_id,
        assigned_by: user?.id,
        due_date: a.item.expiry_date,
        priority: a.risk,
        status: 'pending',
      }))
      const { error } = await supabase.from('weekly_tasks').insert(inserts)
      if (error) throw error
      toast({ title: 'Assignments Saved', description: `${inserts.length} assignments saved to weekly_tasks` })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to save assignments')
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' })
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassignAll = () => {
    setAssignments([])
    toast({ title: 'Assignments Cleared', description: 'All assignments have been cleared' })
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Please log in to access assignments.</p>
        </div>
      </div>
    )
  }

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="border-b border-slate-700 bg-slate-800 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">Task Assignment</h1>
              <p className="text-slate-400">Assign stock items equally among all dispensers</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <Alert className="bg-slate-800 border-slate-700">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-slate-300">
              Access denied. Only administrators and regional managers can access task assignments.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Loading assignments...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800 px-6 py-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Task Assignment</h1>
            <p className="text-slate-400">Assign stock items equally among all dispensers</p>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              onClick={handleUnassignAll}
            >
              Unassign All Tasks
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              onClick={handleEqualDistribution}
              disabled={loading || assigning}
            >
              <Shuffle className="h-4 w-4" />
              Equal Distribution
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
              onClick={handleSaveAssignments}
              disabled={assigning || assignments.length === 0}
            >
              Save Assignments
            </Button>
            <Button 
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
              onClick={handleDeleteAllStock}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              Delete All Stock
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Assignments Table */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-blue-400" />
              <div>
                <CardTitle className="text-white">Assignments ({assignments.length})</CardTitle>
                <p className="text-sm text-slate-400">
                  Items are distributed equally among all dispensers by month and risk category.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <div className="text-center py-16">
                <Package className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No assignments generated</h3>
                <p className="text-slate-400">
                  Click "Equal Distribution" to generate assignments for the current and future months.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-700 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-white">{assignments.length}</div>
                    <div className="text-sm text-slate-400">Total Assignments</div>
                  </div>
                  <div className="bg-slate-700 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-500">
                      {assignments.filter(a => a.risk === 'critical').length}
                    </div>
                    <div className="text-sm text-slate-400">Critical Risk</div>
                  </div>
                  <div className="bg-slate-700 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-500">
                      {assignments.filter(a => a.risk === 'high').length}
                    </div>
                    <div className="text-sm text-slate-400">High Risk</div>
                  </div>
                  <div className="bg-slate-700 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-500">
                      {assignments.filter(a => a.risk === 'medium' || a.risk === 'low').length}
                    </div>
                    <div className="text-sm text-slate-400">Medium/Low Risk</div>
                  </div>
                </div>

                {/* Assignments Table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-700">
                        <TableHead className="text-slate-300">Dispenser</TableHead>
                        <TableHead className="text-slate-300">Month</TableHead>
                        <TableHead className="text-slate-300">Risk Level</TableHead>
                        <TableHead className="text-slate-300">Product</TableHead>
                        <TableHead className="text-slate-300">Quantity</TableHead>
                        <TableHead className="text-slate-300">Unit Price</TableHead>
                        <TableHead className="text-slate-300">Expiry Date</TableHead>
                        <TableHead className="text-slate-300">Branch</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((assignment, index) => (
                        <TableRow key={index} className="border-b border-slate-600 hover:bg-slate-700">
                          <TableCell className="font-medium text-white">
                            {assignment.dispenser_name}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {assignment.month}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                assignment.risk === 'critical' ? 'destructive' :
                                assignment.risk === 'high' ? 'secondary' : 'outline'
                              }
                            >
                              {assignment.risk}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-white">
                            {assignment.item.product_name}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {assignment.item.quantity}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            ${assignment.item.unit_price}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {format(new Date(assignment.item.expiry_date), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {assignment.item.branch}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Assignments
