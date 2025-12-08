import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  Building2, 
  Package, 
  DollarSign, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Download,
  BarChart3
} from 'lucide-react'
import { format } from 'date-fns'
import { formatUGX } from '@/utils/currency'
import type { Branch } from '@/hooks/useUserBranches'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Edit } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { extractErrorMessage } from '@/lib/utils'

interface BranchMetrics {
  branchId: string
  branchName: string
  branchCode?: string
  totalItems: number
  totalValue: number
  expiringSoon: number // Items expiring in next 30 days
  expired: number
  lowStockItems: number // Items with quantity < 10
  highValueItems: number // Items with value > 100,000
}

interface ExpiryTrend {
  month: string
  count: number
  value: number
}

interface StockItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  expiry_date: string
  branch_id: string
  status?: string
  risk_level?: string
  days_to_expiry?: number
}


const BranchAnalytics: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager, availableBranches } = useBranch()
  const { userRole } = useUserRole()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<BranchMetrics | null>(null)
  const [allBranchesMetrics, setAllBranchesMetrics] = useState<BranchMetrics[]>([])
  const [expiryTrends, setExpiryTrends] = useState<ExpiryTrend[]>([])
  const [stockItemsByMonth, setStockItemsByMonth] = useState<Map<string, StockItem[]>>(new Map())
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [monthProductsDialogOpen, setMonthProductsDialogOpen] = useState(false)
  const [monthProducts, setMonthProducts] = useState<StockItem[]>([])
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(1)
  const [adjustLoading, setAdjustLoading] = useState(false)
  const { toast } = useToast()

  // Fetch branch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!selectedBranch) {
        console.log('⚠️ BranchAnalytics: No branch selected, clearing metrics')
        setMetrics(null)
        setExpiryTrends([])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        console.log('🔍 BranchAnalytics: Fetching data for branch:', selectedBranch.id, selectedBranch.name)
        
        // Fetch stock items for selected branch
        const { data: stockItems, error: stockError } = await supabase
          .from('stock_items')
          .select('*')
          .eq('branch_id', selectedBranch.id)

        console.log('🔍 BranchAnalytics: Stock items query result:', {
          count: stockItems?.length || 0,
          error: stockError,
          branchId: selectedBranch.id,
          branchName: selectedBranch.name,
          sampleItem: stockItems?.[0]
        })

        if (stockError) {
          console.error('❌ BranchAnalytics: Stock items query error:', stockError)
          throw stockError
        }

        // Ensure we have an array to work with
        const items = stockItems || []
        
        // Calculate metrics
        const now = new Date()
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        
        const totalItems = items.length
        const totalValue = items.reduce((sum, item) => {
          const qty = item.quantity || 0
          const price = item.unit_price || 0
          return sum + (qty * price)
        }, 0)
        
        const expiringSoon = items.filter(item => {
          if (!item.expiry_date) return false
          const expiryDate = new Date(item.expiry_date)
          return expiryDate >= now && expiryDate <= thirtyDaysFromNow
        }).length
        
        const expired = items.filter(item => {
          if (!item.expiry_date) return false
          const expiryDate = new Date(item.expiry_date)
          return expiryDate < now
        }).length
        
        const lowStockItems = items.filter(item => (item.quantity || 0) < 10).length
        const highValueItems = items.filter(item => {
          const qty = item.quantity || 0
          const price = item.unit_price || 0
          return (qty * price) > 100000
        }).length

        console.log('📊 BranchAnalytics: Calculated metrics:', {
          totalItems,
          totalValue,
          expiringSoon,
          expired,
          lowStockItems,
          highValueItems
        })

        const metricsData: BranchMetrics = {
          branchId: selectedBranch.id,
          branchName: selectedBranch.name,
          branchCode: selectedBranch.code,
          totalItems,
          totalValue,
          expiringSoon,
          expired,
          lowStockItems,
          highValueItems
        }

        console.log('✅ BranchAnalytics: Setting metrics:', metricsData)
        setMetrics(metricsData)

        // Fetch expiry trends and group items by month
        const trends: ExpiryTrend[] = []
        const months = new Map<string, { count: number; value: number }>()
        const itemsByMonth = new Map<string, StockItem[]>()

        items.forEach(item => {
          if (!item.expiry_date) return
          // Skip items with quantity 0 (out of stock/completed items)
          if ((item.quantity || 0) === 0) return
          try {
            const expiryDate = new Date(item.expiry_date)
            if (isNaN(expiryDate.getTime())) return // Skip invalid dates
            
            const monthKey = format(expiryDate, 'MMM yyyy')
            const qty = item.quantity || 0
            const price = item.unit_price || 0
            const value = qty * price

            if (!months.has(monthKey)) {
              months.set(monthKey, { count: 0, value: 0 })
              itemsByMonth.set(monthKey, [])
            }

            const monthData = months.get(monthKey)!
            monthData.count += 1
            monthData.value += value

            // Store the item for this month
            const monthItems = itemsByMonth.get(monthKey)!
            monthItems.push(item as StockItem)
          } catch (error) {
            console.warn('⚠️ BranchAnalytics: Error processing item for trends:', item.id, error)
          }
        })

        months.forEach((data, month) => {
          trends.push({
            month,
            count: data.count,
            value: data.value
          })
        })

        trends.sort((a, b) => {
          try {
            return new Date(a.month).getTime() - new Date(b.month).getTime()
          } catch {
            return 0
          }
        })
        
        console.log('✅ BranchAnalytics: Setting expiry trends:', trends.length)
        setExpiryTrends(trends.slice(0, 12)) // Last 12 months
        setStockItemsByMonth(itemsByMonth) // Store items grouped by month

      } catch (error) {
        console.error('❌ BranchAnalytics: Error fetching metrics:', error)
        // Set empty metrics on error so UI shows something
        if (selectedBranch) {
          setMetrics({
            branchId: selectedBranch.id,
            branchName: selectedBranch.name,
            branchCode: selectedBranch.code,
            totalItems: 0,
            totalValue: 0,
            expiringSoon: 0,
            expired: 0,
            lowStockItems: 0,
            highValueItems: 0
          })
          setExpiryTrends([])
        } else {
          setMetrics(null)
          setExpiryTrends([])
        }
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [selectedBranch?.id]) // Only depend on branch ID to avoid unnecessary re-renders

  // Fetch all branches metrics for system admins
  useEffect(() => {
    const fetchAllBranchesMetrics = async () => {
      if (!isSystemAdmin && !isRegionalManager) return
      if (!selectedBranch) return

      try {
        // For system admin, fetch all branches; for regional manager, just selected branch
        const branchesToFetch = isSystemAdmin ? availableBranches : [selectedBranch]
        const allMetrics: BranchMetrics[] = []

        for (const branch of branchesToFetch) {
          if (!branch) continue

          const { data: stockItems } = await supabase
            .from('stock_items')
            .select('*')
            .eq('branch_id', branch.id)

          const now = new Date()
          const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

          const totalItems = stockItems?.length || 0
          const totalValue = stockItems?.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) || 0
          const expiringSoon = stockItems?.filter(item => {
            const expiryDate = new Date(item.expiry_date)
            return expiryDate >= now && expiryDate <= thirtyDaysFromNow
          }).length || 0
          const expired = stockItems?.filter(item => {
            const expiryDate = new Date(item.expiry_date)
            return expiryDate < now
          }).length || 0
          const lowStockItems = stockItems?.filter(item => item.quantity < 10).length || 0
          const highValueItems = stockItems?.filter(item => (item.quantity * item.unit_price) > 100000).length || 0

          allMetrics.push({
            branchId: branch.id,
            branchName: branch.name,
            branchCode: branch.code,
            totalItems,
            totalValue,
            expiringSoon,
            expired,
            lowStockItems,
            highValueItems
          })
        }

        setAllBranchesMetrics(allMetrics)
      } catch (error) {
        console.error('Error fetching all branches metrics:', error)
      }
    }

    if (isSystemAdmin || isRegionalManager) {
      fetchAllBranchesMetrics()
    }
  }, [isSystemAdmin, isRegionalManager, availableBranches, selectedBranch])

  const downloadCSV = () => {
    if (!metrics) return

    const headers = ['Metric', 'Value']
    const rows = [
      ['Branch', metrics.branchName],
      ['Total Items', metrics.totalItems.toString()],
      ['Total Value', formatUGX(metrics.totalValue)],
      ['Expiring Soon (30 days)', metrics.expiringSoon.toString()],
      ['Expired Items', metrics.expired.toString()],
      ['Low Stock Items', metrics.lowStockItems.toString()],
      ['High Value Items', metrics.highValueItems.toString()]
    ]

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', `branch_analytics_${metrics.branchName}_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleMonthClick = (month: string) => {
    const products = (stockItemsByMonth.get(month) || []).filter(item => (item.quantity || 0) > 0)
    setSelectedMonth(month)
    setMonthProducts(products)
    setMonthProductsDialogOpen(true)
  }

  const handleAdjustQuantity = (item: StockItem) => {
    setAdjustItem(item)
    setAdjustQty(1)
    setAdjustDialogOpen(true)
  }

  const handleAdjustSubmit = async () => {
    if (!adjustItem || adjustQty < 1 || adjustQty > adjustItem.quantity) return
    
    setAdjustLoading(true)
    try {
      const newQty = adjustItem.quantity - adjustQty
      const updateObj: { quantity: number; status?: string } = { quantity: newQty }
      if (newQty === 0) updateObj.status = 'out_of_stock'
      
      const { error: updateError } = await supabase
        .from('stock_items')
        .update(updateObj)
        .eq('id', adjustItem.id)
      
      if (updateError) throw updateError
      
      // Record movement
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.id) {
        throw new Error('User not authenticated')
      }
      
      const movementType = newQty === 0 ? 'completion' : 'adjustment'
      const notes = newQty === 0 
        ? `COMPLETED: ${adjustItem.product_name} - Item fully consumed from expiry trends`
        : `Quantity adjusted from expiry trends. Product: ${adjustItem.product_name}`
      
      const movementData = {
        stock_item_id: adjustItem.id,
        movement_type: movementType,
        quantity_moved: adjustQty,
        from_branch_id: adjustItem.branch_id || null,
        to_branch_id: null,
        for_dispenser: null,
        moved_by: user.id,
        movement_date: new Date().toISOString(),
        notes: notes
      }

      const { error: historyError } = await supabase
        .from('stock_movement_history')
        .insert(movementData)

      if (historyError) {
        console.error('Movement history error:', historyError)
        toast({ 
          title: 'Partial Success', 
          description: `Stock updated but movement history failed. Error: ${historyError.message}. New quantity: ${newQty}` 
        })
      } else {
        toast({ title: 'Success', description: `Quantity adjusted and movement recorded. New quantity: ${newQty}` })
      }

      // If quantity reached zero, update any associated weekly_tasks to completed
      if (newQty === 0) {
        await supabase
          .from('weekly_tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('product_id', adjustItem.id)
          .eq('status', 'pending')
      }

      // Update local state - refresh the month products and filter out items with quantity 0
      setMonthProducts(prev => prev
        .map(item => 
          item.id === adjustItem.id 
            ? { ...item, quantity: newQty }
            : item
        )
        .filter(item => (item.quantity || 0) > 0) // Remove items with quantity 0
      )

      // Also update the stockItemsByMonth map and filter out items with quantity 0
      setStockItemsByMonth(prev => {
        const updated = new Map(prev)
        updated.forEach((items, month) => {
          const updatedItems = items
            .map(item => 
              item.id === adjustItem.id 
                ? { ...item, quantity: newQty }
                : item
            )
            .filter(item => (item.quantity || 0) > 0) // Remove items with quantity 0
          updated.set(month, updatedItems)
        })
        return updated
      })

      setAdjustDialogOpen(false)
      setAdjustItem(null)
      setAdjustQty(1)
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to adjust quantity')
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' })
    } finally {
      setAdjustLoading(false)
    }
  }

  const canAdjustQuantity = userRole !== 'regional_manager'

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Branch Analytics
          </CardTitle>
          <CardDescription>Loading analytics data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  if (!selectedBranch || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Branch Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-4">
            Please select a branch to view analytics.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6" />
            Branch Analytics
          </CardTitle>
          <CardDescription>
            Comprehensive analytics for {metrics.branchName}
            {metrics.branchCode && ` (${metrics.branchCode})`}
          </CardDescription>
        </div>
        <Button onClick={downloadCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="expiry">Expiry Trends</TabsTrigger>
            {(isSystemAdmin || isRegionalManager) && (
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Stock Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-500" />
                    <div className="text-2xl font-bold">{metrics.totalItems}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Stock Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-500" />
                    <div className="text-2xl font-bold">{formatUGX(metrics.totalValue)}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Expiring Soon
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <div className="text-2xl font-bold">{metrics.expiringSoon}</div>
                    {metrics.expired > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {metrics.expired} expired
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Low Stock Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-orange-500" />
                    <div className="text-xl font-bold">{metrics.lowStockItems}</div>
                    <span className="text-sm text-muted-foreground">
                      (quantity &lt; 10)
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    High Value Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <div className="text-xl font-bold">{metrics.highValueItems}</div>
                    <span className="text-sm text-muted-foreground">
                      (value &gt; 100,000)
                    </span>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Expiry Trends Tab */}
          <TabsContent value="expiry" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Expiry Trends by Month</h3>
              <Badge variant="outline">
                {expiryTrends.length} months
              </Badge>
            </div>

            {expiryTrends.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                No expiry data available
              </div>
            ) : (
              <div className="space-y-4">
                {/* Simple Bar Chart Representation */}
                <div className="space-y-2">
                  {expiryTrends.map((trend) => {
                    const maxValue = Math.max(...expiryTrends.map(t => t.value))
                    const percentage = maxValue > 0 ? (trend.value / maxValue) * 100 : 0

                    return (
                      <div 
                        key={trend.month} 
                        className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
                        onClick={() => handleMonthClick(trend.month)}
                        title="Click to view products for this month"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{trend.month}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground">
                              {trend.count} items
                            </span>
                            <span className="font-semibold">
                              {formatUGX(trend.value)}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Table View */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Items Count</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiryTrends.map((trend) => (
                      <TableRow 
                        key={trend.month}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleMonthClick(trend.month)}
                        title="Click to view products for this month"
                      >
                        <TableCell className="font-medium">{trend.month}</TableCell>
                        <TableCell className="text-right">{trend.count}</TableCell>
                        <TableCell className="text-right">{formatUGX(trend.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Comparison Tab (System Admin Only) */}
          {(isSystemAdmin || isRegionalManager) && (
            <TabsContent value="comparison" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Branch Performance Comparison</h3>
                <Badge variant="outline">
                  {allBranchesMetrics.length} branches
                </Badge>
              </div>

              {allBranchesMetrics.length === 0 ? (
                <div className="text-center text-muted-foreground p-8">
                  No comparison data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Expiring Soon</TableHead>
                      <TableHead className="text-right">Low Stock</TableHead>
                      <TableHead className="text-right">High Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allBranchesMetrics
                      .sort((a, b) => b.totalValue - a.totalValue)
                      .map((branchMetrics) => (
                        <TableRow
                          key={branchMetrics.branchId}
                          className={
                            branchMetrics.branchId === selectedBranch?.id
                              ? 'bg-blue-50 dark:bg-blue-950'
                              : ''
                          }
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              {branchMetrics.branchName}
                              {branchMetrics.branchCode && (
                                <Badge variant="outline" className="text-xs">
                                  {branchMetrics.branchCode}
                                </Badge>
                              )}
                              {branchMetrics.branchId === selectedBranch?.id && (
                                <Badge>Current</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {branchMetrics.totalItems}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatUGX(branchMetrics.totalValue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {branchMetrics.expiringSoon}
                              {branchMetrics.expired > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {branchMetrics.expired} expired
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {branchMetrics.lowStockItems}
                          </TableCell>
                          <TableCell className="text-right">
                            {branchMetrics.highValueItems}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>

      {/* Month Products Dialog */}
      <Dialog open={monthProductsDialogOpen} onOpenChange={setMonthProductsDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">
              Products Expiring in {selectedMonth}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              View and manage products expiring in this month. Click Adjust to modify quantities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Total: {monthProducts.length} products</span>
              <span>Total Value: {formatUGX(monthProducts.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0))}</span>
            </div>
            
            {monthProducts.length === 0 ? (
              <div className="text-center text-slate-400 p-8">
                No products found for this month
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-300">Product Name</TableHead>
                    <TableHead className="text-slate-300 text-right">Quantity</TableHead>
                    <TableHead className="text-slate-300 text-right">Unit Price</TableHead>
                    <TableHead className="text-slate-300 text-right">Total Value</TableHead>
                    <TableHead className="text-slate-300 text-right">Expiry Date</TableHead>
                    <TableHead className="text-slate-300 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthProducts.map((item) => {
                    const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                    const totalValue = item.quantity * item.unit_price
                    const isExpired = daysToExpiry < 0
                    const isExpiringSoon = daysToExpiry >= 0 && daysToExpiry <= 30

                    return (
                      <TableRow key={item.id} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell className="font-medium text-white">{item.product_name}</TableCell>
                        <TableCell className="text-right text-slate-300">{item.quantity}</TableCell>
                        <TableCell className="text-right text-slate-300">{formatUGX(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-semibold text-white">{formatUGX(totalValue)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-sm ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-yellow-400' : 'text-slate-300'}`}>
                              {format(new Date(item.expiry_date), 'MMM dd, yyyy')}
                            </span>
                            <Badge variant={isExpired ? 'destructive' : isExpiringSoon ? 'default' : 'outline'} className="text-xs">
                              {isExpired ? 'Expired' : isExpiringSoon ? `${daysToExpiry} days` : `${daysToExpiry} days`}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {canAdjustQuantity && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAdjustQuantity(item)}
                              className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Adjust
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjust Quantity Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Adjust Quantity</DialogTitle>
            <DialogDescription className="text-slate-400">
              Adjust the quantity of this product. The adjustment will be recorded in movement history.
            </DialogDescription>
          </DialogHeader>
          {adjustItem && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-white">Product:</div>
                <div className="text-slate-300">{adjustItem.product_name}</div>
                <div className="font-semibold text-white mt-2">Current Quantity:</div>
                <div className="text-lg font-bold text-white">{adjustItem.quantity} units</div>
                <div className="font-semibold text-white mt-2">Unit Price:</div>
                <div className="text-slate-300">{formatUGX(adjustItem.unit_price)}</div>
                <div className="font-semibold text-white mt-2">Total Value:</div>
                <div className="text-lg font-bold text-white">{formatUGX(adjustItem.quantity * adjustItem.unit_price)}</div>
              </div>
              <div>
                <Label htmlFor="adjust-qty" className="text-slate-300">Quantity to adjust</Label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min={1}
                  max={adjustItem.quantity}
                  value={adjustQty}
                  onChange={e => setAdjustQty(Math.max(1, Math.min(adjustItem.quantity, parseInt(e.target.value) || 1)))}
                  className="w-24 bg-slate-700 border-slate-600 text-white"
                  disabled={adjustLoading}
                />
                <div className="text-sm text-slate-400 mt-1">
                  New quantity: {adjustItem.quantity - adjustQty} units
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleAdjustSubmit} 
                  disabled={adjustLoading || adjustQty < 1 || adjustQty > adjustItem.quantity} 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {adjustLoading ? 'Processing...' : 'Confirm Adjustment'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setAdjustDialogOpen(false)} 
                  disabled={adjustLoading}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default BranchAnalytics


