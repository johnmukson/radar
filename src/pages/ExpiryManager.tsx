import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { useBranch } from '@/contexts/BranchContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, Search, Filter, Download, ArrowUpDown, Calendar, Package, Building, User, Trophy, Target, TrendingUp, TrendingDown, Award, Clock, CheckCircle, XCircle, AlertTriangle, Trash2, FileText, BarChart2, Building2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { extractErrorMessage } from '@/lib/utils'
import RiskLevelDefinitions from '@/components/RiskLevelDefinitions'

interface StockItem {
  id: string
  product_name: string
  branch: string
  expiry_date: string
  quantity: number
  unit_price: number
  created_at: string
  is_emergency: boolean
  emergency_declared_at: string | null
  days_until_expiry: number
  risk_level: string
}

const ExpiryManager = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager } = useBranch()
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [removeReason, setRemoveReason] = useState('')
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportDateRange, setReportDateRange] = useState({ start: '', end: '' })
  const [activeTab, setActiveTab] = useState('all')
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()
  const { userRole, hasAdminAccess, hasDispenserAccess, loading: roleLoading } = useUserRole()
  const [page, setPage] = useState(0)
  const pageSize = 50
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    fetchStockItems()
  }, [page, selectedBranch, isSystemAdmin, isRegionalManager]) // Re-fetch when branch changes

  // Check for expiry warnings and send WhatsApp notifications
  useEffect(() => {
    const checkExpiryWarnings = async () => {
      if (!selectedBranch || !user?.id || !stockItems.length) return

      const now = new Date()
      const criticalThreshold = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
      const warningThreshold = 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds

      // Get items expiring soon
      const expiringItems = stockItems.filter(item => {
        const expiryDate = new Date(item.expiry_date)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntilExpiry >= 0 && daysUntilExpiry <= 30
      })

      if (expiringItems.length === 0) return

      // Get users who should receive expiry warnings (branch admins, managers, system admins)
      try {
        const { data: branchUsers, error: usersError } = await supabase
          .from('users_with_roles')
          .select('user_id, name, phone, role')
          .eq('branch_id', selectedBranch.id)
          .in('role', ['branch_system_admin', 'branch_manager', 'system_admin'])

        if (usersError) throw usersError

        if (!branchUsers || branchUsers.length === 0) return

        // Send warnings for critical items (expiring within 7 days)
        const criticalItems = expiringItems.filter(item => {
          const expiryDate = new Date(item.expiry_date)
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          return daysUntilExpiry <= 7
        })

        // Send warnings for items expiring within 30 days (if not already sent today)
        const warningItems = expiringItems.filter(item => {
          const expiryDate = new Date(item.expiry_date)
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          return daysUntilExpiry > 7 && daysUntilExpiry <= 30
        })

        // Check last warning time (prevent spamming)
        const lastWarningKey = `expiry_warning_${selectedBranch.id}_${now.toDateString()}`
        const lastWarningTime = localStorage.getItem(lastWarningKey)
        const hoursSinceLastWarning = lastWarningTime 
          ? (now.getTime() - parseInt(lastWarningTime)) / (1000 * 60 * 60)
          : Infinity

        // Send warnings once per day
        if (hoursSinceLastWarning >= 24) {
          for (const branchUser of branchUsers) {
            if (!branchUser.phone) continue

            // Format phone number to E.164 format
            let phoneNumber = branchUser.phone.trim()
            if (!phoneNumber.startsWith('+')) {
              phoneNumber = '+' + phoneNumber.replace(/\D/g, '')
            }

            // Send critical expiry warnings
            if (criticalItems.length > 0) {
              const criticalList = criticalItems.slice(0, 10).map(item => 
                `• ${item.product_name} - Expires in ${item.days_until_expiry} days (${format(new Date(item.expiry_date), 'MMM dd, yyyy')})`
              ).join('\n')

              const criticalMessage = `🚨 CRITICAL EXPIRY WARNING 🚨

${criticalItems.length} item(s) expiring within 7 days:

${criticalList}

${criticalItems.length > 10 ? `... and ${criticalItems.length - 10} more items` : ''}

⚠️ Please review and take action immediately!

Branch: ${selectedBranch.name}`

              await supabase.rpc('queue_whatsapp_notification', {
                p_user_id: branchUser.user_id,
                p_branch_id: selectedBranch.id,
                p_recipient_phone: phoneNumber,
                p_message_content: criticalMessage,
                p_message_type: 'expiry_warning',
                p_related_id: criticalItems[0].id,
                p_related_type: 'stock_item',
                p_metadata: {
                  item_count: criticalItems.length,
                  urgency: 'critical',
                  days_until_expiry: Math.min(...criticalItems.map(i => i.days_until_expiry))
                }
              })
            }

            // Send general expiry warnings (30 days)
            if (warningItems.length > 0 && criticalItems.length === 0) {
              const warningList = warningItems.slice(0, 10).map(item => 
                `• ${item.product_name} - Expires in ${item.days_until_expiry} days (${format(new Date(item.expiry_date), 'MMM dd, yyyy')})`
              ).join('\n')

              const warningMessage = `⚠️ EXPIRY WARNING ⚠️

${warningItems.length} item(s) expiring within 30 days:

${warningList}

${warningItems.length > 10 ? `... and ${warningItems.length - 10} more items` : ''}

Please review these items.

Branch: ${selectedBranch.name}`

              await supabase.rpc('queue_whatsapp_notification', {
                p_user_id: branchUser.user_id,
                p_branch_id: selectedBranch.id,
                p_recipient_phone: phoneNumber,
                p_message_content: warningMessage,
                p_message_type: 'expiry_warning',
                p_related_id: warningItems[0].id,
                p_related_type: 'stock_item',
                p_metadata: {
                  item_count: warningItems.length,
                  urgency: 'warning',
                  days_until_expiry: Math.min(...warningItems.map(i => i.days_until_expiry))
                }
              })
            }

            // Trigger processing in background
            supabase.functions.invoke('send-whatsapp', {
              body: { process_pending: true }
            }).catch(err => {
              console.error('Background WhatsApp processing error:', err)
            })
          }

          // Mark warning as sent today
          localStorage.setItem(lastWarningKey, now.getTime().toString())
        }
      } catch (error) {
        console.error('Error checking expiry warnings:', error)
        // Don't show error to user - this is a background task
      }
    }

    // Check immediately and then every 6 hours
    checkExpiryWarnings()
    const interval = setInterval(checkExpiryWarnings, 6 * 60 * 60 * 1000) // Check every 6 hours

    return () => clearInterval(interval)
  }, [stockItems, selectedBranch, user])

  const fetchStockItems = async () => {
    // Don't fetch if no branch selected - ALL users need a selected branch
    if (!selectedBranch) {
      setStockItems([])
      setTotalCount(0)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const from = page * pageSize
      const to = from + pageSize - 1
      
      let query = supabase
        .from('stock_items')
        .select('*', { count: 'exact' })
      
      // ✅ ALWAYS filter by selected branch
      query = query.eq('branch_id', selectedBranch.id)
      
      const { data, error, count } = await query
        .order('expiry_date', { ascending: true })
        .range(from, to)
      if (error) throw error
      const today = new Date()
      const items = data.map(item => {
        const daysUntilExpiry = Math.ceil((new Date(item.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        let risk_level = 'very-low'
        
        if (daysUntilExpiry < 0) risk_level = 'expired'
        else if (daysUntilExpiry <= 30) risk_level = 'critical'      // 0-30 days
        else if (daysUntilExpiry <= 60) risk_level = 'high'          // 31-60 days (Critical range)
        else if (daysUntilExpiry <= 90) risk_level = 'medium-high'   // 61-90 days (High priority range)
        else if (daysUntilExpiry <= 120) risk_level = 'medium-high'  // 91-120 days (Medium-high priority range)
        else if (daysUntilExpiry <= 180) risk_level = 'medium'       // 121-180 days (Medium priority range)
        else if (daysUntilExpiry <= 365) risk_level = 'low'          // 181-365 days (Low priority range)
        else risk_level = 'very-low'                                 // 365+ days (Very low priority range)
        
        return {
          ...item,
          days_until_expiry: daysUntilExpiry,
          risk_level
        }
      })
      setStockItems(items)
      setTotalCount(count || 0)
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch stock items')
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveItem = async () => {
    if (!selectedItem || !removeReason) return

    try {
      // Record the removal in stock_movement_history
      const { error: movementError } = await supabase
        .from('stock_movement_history')
        .insert({
          stock_item_id: selectedItem.id,
          movement_type: 'removal',
          quantity_moved: selectedItem.quantity,
          notes: removeReason,
          moved_by: user?.id,
          from_branch_id: null // We'll need to get the branch_id from the item
        })

      if (movementError) throw movementError

      // Delete the item
      const { error: deleteError } = await supabase
        .from('stock_items')
        .delete()
        .eq('id', selectedItem.id)

      if (deleteError) throw deleteError

      toast({
        title: 'Success',
        description: 'Item has been removed successfully',
      })

      setShowRemoveDialog(false)
      setRemoveReason('')
      setSelectedItem(null)
      fetchStockItems()
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to remove item')
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true)
    
    try {
      // Get only expired items
      const expiredItems = stockItems.filter(item => item.days_until_expiry < 0)
      
      if (expiredItems.length === 0) {
        toast({
          title: "No Expired Items",
          description: "No expired items found to delete.",
        })
        return
      }

      let deletedCount = 0
      let failedCount = 0

      for (const item of expiredItems) {
        try {
          // Record deletion in movement history
          await supabase
            .from('stock_movement_history')
            .insert({
              stock_item_id: item.id,
              movement_type: 'deletion',
              quantity_moved: -item.quantity,
              from_branch_id: null, // We'll need to get the branch_id if needed
              notes: `Bulk delete expired: ${item.product_name}`,
              moved_by: user?.id || 'admin'
            })

          // Delete the expired stock item
          const { error } = await supabase
            .from('stock_items')
            .delete()
            .eq('id', item.id)

          if (error) {
            failedCount++
            console.error(`Failed to delete expired item ${item.id}:`, error)
          } else {
            deletedCount++
          }
        } catch (error) {
          failedCount++
          console.error(`Error deleting expired item ${item.id}:`, error)
        }
      }

      if (deletedCount > 0) {
        toast({
          title: "Expired Items Deleted",
          description: `Successfully deleted ${deletedCount} expired items${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        })
        fetchStockItems() // Refresh the list
      } else {
        toast({
          title: "Error",
          description: "Failed to delete any expired items",
          variant: "destructive",
        })
      }
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to perform bulk delete')
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const generateReport = async () => {
    try {
      const startDate = new Date(reportDateRange.start)
      const endDate = new Date(reportDateRange.end)

      const { data, error } = await supabase
        .from('stock_items')
        .select('*')
        .gte('expiry_date', startDate.toISOString())
        .lte('expiry_date', endDate.toISOString())

      if (error) throw error

      // Calculate metrics
      const metrics = {
        criticalItems: data.filter(item => item.risk_level === 'critical').length,
        nearExpiryItems: data.filter(item => item.risk_level === 'high').length,
        expiredItems: data.filter(item => item.days_until_expiry < 0).length,
        totalItems: data.length,
        criticalValue: data
          .filter(item => item.risk_level === 'critical')
          .reduce((sum, item) => sum + (item.quantity * item.unit_price), 0),
        nearExpiryValue: data
          .filter(item => item.risk_level === 'high')
          .reduce((sum, item) => sum + (item.quantity * item.unit_price), 0),
        expiredValue: data
          .filter(item => item.days_until_expiry < 0)
          .reduce((sum, item) => sum + (item.quantity * item.unit_price), 0),
        totalValue: data.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
      }

      // Create CSV content
      const headers = ['Product Name', 'Branch', 'Expiry Date', 'Quantity', 'Unit Price', 'Total Value', 'Status']
      const rows = data.map(item => [
        item.product_name,
        item.branch,
        format(new Date(item.expiry_date), 'MMM dd, yyyy'),
        item.quantity.toString(),
        item.unit_price.toString(),
        (item.quantity * item.unit_price).toString(),
        item.days_until_expiry < 0
          ? 'Expired'
          : item.days_until_expiry <= 30
          ? 'Critical'
          : item.days_until_expiry <= 60
          ? 'Near Expiry'
          : 'Good',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `expiry-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`
      link.click()
      
      toast({
        title: 'Success',
        description: 'Report has been generated successfully',
      })

      setShowReportDialog(false)
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to generate report')
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  const filteredItems = stockItems.filter(item => {
    const matchesSearch = item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.branch.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = selectedFilter === 'all' ||
                         (selectedFilter === 'critical' && item.risk_level === 'critical') ||
                         (selectedFilter === 'expired' && item.days_until_expiry < 0) ||
                         (selectedFilter === 'expiring-soon' && item.days_until_expiry <= 30 && item.days_until_expiry >= 0)

    return matchesSearch && matchesFilter
  })

  const totalItems = stockItems.length
  const criticalItems = stockItems.filter(item => item.risk_level === 'critical').length
  const expiredItems = stockItems.filter(item => item.days_until_expiry < 0).length
  const totalValue = stockItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Expiry Management</h1>
            <p className="text-muted-foreground">Monitor and manage stock expiry</p>
            {/* ✅ Branch Context Display */}
            {selectedBranch && (
              <div className="flex items-center gap-2 mt-2">
                <Building2 className="h-4 w-4 text-blue-400" />
                <Badge variant="outline" className="text-xs">
                  {selectedBranch.name} ({selectedBranch.code})
                  {selectedBranch.region && ` - ${selectedBranch.region}`}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {expiredItems > 0 && (
              <Button 
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                disabled={isBulkDeleting}
                onClick={handleBulkDelete}
                title="Delete expired stock items only"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isBulkDeleting ? 'Deleting Expired...' : `Delete Expired (${expiredItems})`}
              </Button>
            )}
            <Button 
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              onClick={() => setShowReportDialog(true)}
            >
              <Download className="h-4 w-4" />
              Generate Report
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Items</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{criticalItems}</div>
              <p className="text-xs text-muted-foreground">
                Items expiring within 30 days
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">
                Total stock items
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired Items</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiredItems}</div>
              <p className="text-xs text-muted-foreground">
                Items past expiry date
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">USh {totalValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Total inventory value
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Risk Level Definitions */}
        <div className="mb-6">
          <RiskLevelDefinitions />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Items</TabsTrigger>
            <TabsTrigger value="expired">Expired Items</TabsTrigger>
            <TabsTrigger value="critical">Critical Items</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {/* Filters and Search */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="critical">Critical Only</SelectItem>
                  <SelectItem value="expired">Expired Only</SelectItem>
                  <SelectItem value="expiring-soon">Expiring Soon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stock Items Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Items Requiring Attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No items found matching your criteria
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredItems.map((item) => (
                      <Card key={item.id} className={`${item.days_until_expiry < 0 ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg flex items-center gap-2">
                                {item.product_name}
                                {item.is_emergency && (
                                  <Badge variant="destructive" className="flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Emergency
                                  </Badge>
                                )}
                              </CardTitle>
                              <CardDescription>
                                {item.branch} • Quantity: {item.quantity} • USh {item.unit_price} each
                              </CardDescription>
                            </div>
                            <div className="flex gap-2 items-center">
                              {item.days_until_expiry < 0 ? (
                                <Badge variant="destructive">Expired</Badge>
                              ) : item.days_until_expiry <= 30 ? (
                                <Badge variant="destructive">Critical</Badge>
                              ) : item.days_until_expiry <= 60 ? (
                                <Badge variant="destructive">Near Expiry</Badge>
                              ) : (
                                <Badge variant="secondary">Good</Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-2">
                            <span>Expiry: {format(new Date(item.expiry_date), 'MMM dd, yyyy')}</span>
                            <span>Added: {format(new Date(item.created_at), 'MMM dd, yyyy')}</span>
                            <span>Value: <span className="font-medium">USh {item.unit_price * item.quantity}</span></span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              title="Adjust Quantity is available in the Stock Manager page"
                            >
                              Adjust Quantity
                            </Button>
                            {(hasAdminAccess || hasDispenserAccess) && item.days_until_expiry < 0 && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setSelectedItem(item)
                                  setShowRemoveDialog(true)
                                }}
                              >
                                Remove Item
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between items-center mt-4">
              <Button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
              <span>Page {page + 1} of {Math.ceil(totalCount / pageSize) || 1}</span>
              <Button onClick={() => setPage(p => (p + 1 < Math.ceil(totalCount / pageSize) ? p + 1 : p))} disabled={page + 1 >= Math.ceil(totalCount / pageSize)}>Next</Button>
            </div>
          </TabsContent>

          <TabsContent value="expired" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Expired Items
                </CardTitle>
                <CardDescription>
                  Items whose expiry date has passed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : stockItems.filter(item => item.days_until_expiry < 0).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No expired items found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stockItems
                      .filter(item => item.days_until_expiry < 0)
                      .map((item) => (
                        <Card key={item.id} className="border-destructive/50 bg-destructive/5">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  {item.product_name}
                                  {item.is_emergency && (
                                    <Badge variant="destructive" className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Emergency
                                    </Badge>
                                  )}
                                </CardTitle>
                                <CardDescription>
                                  {item.branch} • Quantity: {item.quantity} • USh {item.unit_price} each
                                </CardDescription>
                              </div>
                              <Badge variant="destructive">Expired</Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-2">
                              <span>Expiry: {format(new Date(item.expiry_date), 'MMM dd, yyyy')}</span>
                              <span>Added: {format(new Date(item.created_at), 'MMM dd, yyyy')}</span>
                              <span>Value: <span className="font-medium">USh {item.unit_price * item.quantity}</span></span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                title="Adjust Quantity is available in the Stock Manager page"
                              >
                                Adjust Quantity
                              </Button>
                              {(hasAdminAccess || hasDispenserAccess) && item.days_until_expiry < 0 && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedItem(item)
                                    setShowRemoveDialog(true)
                                  }}
                                >
                                  Remove Item
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="critical" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Critical Items
                </CardTitle>
                <CardDescription>
                  Items expiring within 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : stockItems.filter(item => item.days_until_expiry <= 30 && item.days_until_expiry >= 0).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No critical items found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stockItems
                      .filter(item => item.days_until_expiry <= 30 && item.days_until_expiry >= 0)
                      .map((item) => (
                        <Card key={item.id} className="border-destructive/50 bg-destructive/5">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  {item.product_name}
                                  {item.is_emergency && (
                                    <Badge variant="destructive" className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Emergency
                                    </Badge>
                                  )}
                                </CardTitle>
                                <CardDescription>
                                  {item.branch} • Quantity: {item.quantity} • USh {item.unit_price} each
                                </CardDescription>
                              </div>
                              <Badge variant="destructive">Critical</Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-2">
                              <span>Expiry: {format(new Date(item.expiry_date), 'MMM dd, yyyy')}</span>
                              <span>Added: {format(new Date(item.created_at), 'MMM dd, yyyy')}</span>
                              <span>Value: <span className="font-medium">USh {item.unit_price * item.quantity}</span></span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                title="Adjust Quantity is available in the Stock Manager page"
                              >
                                Adjust Quantity
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Remove Item Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Remove Expired Item</DialogTitle>
            <DialogDescription className="text-slate-400">
              Please provide a reason for removing this item from inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-slate-300">Reason for Removal</Label>
            <Input
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              className="mt-2 bg-slate-700 border-slate-600 text-white"
              placeholder="Enter reason for removal..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="text-slate-300 border-slate-600 hover:bg-slate-700"
              onClick={() => setShowRemoveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveItem}
              disabled={!removeReason}
            >
              Remove Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Generate Expiry Report</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select a date range to generate a report of expired and expiring items.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label className="text-slate-300">Start Date</Label>
              <Input
                type="date"
                value={reportDateRange.start}
                onChange={(e) => setReportDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="mt-2 bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">End Date</Label>
              <Input
                type="date"
                value={reportDateRange.end}
                onChange={(e) => setReportDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="mt-2 bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="text-slate-300 border-slate-600 hover:bg-slate-700"
              onClick={() => setShowReportDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={generateReport}
              disabled={!reportDateRange.start || !reportDateRange.end}
            >
              Generate Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ExpiryManager
