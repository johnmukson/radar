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
  Users,
  Activity,
  Download,
  BarChart3
} from 'lucide-react'
import { format } from 'date-fns'
import { formatUGX } from '@/utils/currency'
import type { Branch } from '@/hooks/useUserBranches'

interface BranchMetrics {
  branchId: string
  branchName: string
  branchCode?: string
  totalItems: number
  totalValue: number
  expiringSoon: number // Items expiring in next 30 days
  expired: number
  totalAssignments: number
  pendingAssignments: number
  completedAssignments: number
  lowStockItems: number // Items with quantity < 10
  highValueItems: number // Items with value > 100,000
}

interface ExpiryTrend {
  month: string
  count: number
  value: number
}

interface AssignmentStats {
  total: number
  pending: number
  completed: number
  inProgress: number
}

const BranchAnalytics: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager, availableBranches } = useBranch()
  const { userRole } = useUserRole()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<BranchMetrics | null>(null)
  const [allBranchesMetrics, setAllBranchesMetrics] = useState<BranchMetrics[]>([])
  const [expiryTrends, setExpiryTrends] = useState<ExpiryTrend[]>([])
  const [assignmentStats, setAssignmentStats] = useState<AssignmentStats | null>(null)

  // Fetch branch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!selectedBranch) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Fetch stock items for selected branch
        const { data: stockItems, error: stockError } = await supabase
          .from('stock_items')
          .select('*')
          .eq('branch_id', selectedBranch.id)

        if (stockError) throw stockError

        // Calculate metrics
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

        // Fetch emergency assignments for this branch
        // First get stock item IDs for this branch
        const stockItemIds = stockItems?.map(item => item.id) || []
        
        let assignments: any[] = []
        if (stockItemIds.length > 0) {
          const { data: assignmentData, error: assignmentError } = await supabase
            .from('emergency_assignments')
            .select('*')
            .in('stock_item_id', stockItemIds)

          if (assignmentError) {
            console.error('Assignment error:', assignmentError)
          } else {
            assignments = assignmentData || []
          }
        }

        const totalAssignments = assignments?.length || 0
        const pendingAssignments = assignments?.filter(a => a.status === 'pending').length || 0
        const completedAssignments = assignments?.filter(a => a.status === 'completed').length || 0

        setMetrics({
          branchId: selectedBranch.id,
          branchName: selectedBranch.name,
          branchCode: selectedBranch.code,
          totalItems,
          totalValue,
          expiringSoon,
          expired,
          totalAssignments,
          pendingAssignments,
          completedAssignments,
          lowStockItems,
          highValueItems
        })

        // Fetch expiry trends
        const trends: ExpiryTrend[] = []
        const months = new Map<string, { count: number; value: number }>()

        stockItems?.forEach(item => {
          const expiryDate = new Date(item.expiry_date)
          const monthKey = format(expiryDate, 'MMM yyyy')
          const value = item.quantity * item.unit_price

          if (!months.has(monthKey)) {
            months.set(monthKey, { count: 0, value: 0 })
          }

          const monthData = months.get(monthKey)!
          monthData.count += 1
          monthData.value += value
        })

        months.forEach((data, month) => {
          trends.push({
            month,
            count: data.count,
            value: data.value
          })
        })

        trends.sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
        setExpiryTrends(trends.slice(0, 12)) // Last 12 months

        // Set assignment stats
        setAssignmentStats({
          total: totalAssignments,
          pending: pendingAssignments,
          completed: completedAssignments,
          inProgress: totalAssignments - pendingAssignments - completedAssignments
        })

      } catch (error) {
        console.error('Error fetching metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [selectedBranch])

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

          // Get stock item IDs for this branch first
          const branchStockItemIds = stockItems?.map(item => item.id) || []
          
          let assignments: any[] = []
          if (branchStockItemIds.length > 0) {
            const { data: assignmentData } = await supabase
              .from('emergency_assignments')
              .select('*')
              .in('stock_item_id', branchStockItemIds)
            
            assignments = assignmentData || []
          }

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
            totalAssignments: assignments?.length || 0,
            pendingAssignments: assignments?.filter(a => a.status === 'pending').length || 0,
            completedAssignments: assignments?.filter(a => a.status === 'completed').length || 0,
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
      ['High Value Items', metrics.highValueItems.toString()],
      ['Total Assignments', metrics.totalAssignments.toString()],
      ['Pending Assignments', metrics.pendingAssignments.toString()],
      ['Completed Assignments', metrics.completedAssignments.toString()]
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="expiry">Expiry Trends</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
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

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Assignments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-500" />
                    <div className="text-2xl font-bold">{metrics.totalAssignments}</div>
                    {metrics.pendingAssignments > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {metrics.pendingAssignments} pending
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

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Completion Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    <div className="text-xl font-bold">
                      {metrics.totalAssignments > 0
                        ? Math.round((metrics.completedAssignments / metrics.totalAssignments) * 100)
                        : 0}%
                    </div>
                    <span className="text-sm text-muted-foreground">
                      assignments completed
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
                      <div key={trend.month} className="space-y-1">
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
                      <TableRow key={trend.month}>
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

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4">
            {assignmentStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{assignmentStats.total}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Pending
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {assignmentStats.pending}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        In Progress
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {assignmentStats.inProgress}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Completed
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {assignmentStats.completed}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Progress Bar */}
                {assignmentStats.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Completion Progress</span>
                      <span className="font-semibold">
                        {Math.round((assignmentStats.completed / assignmentStats.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-green-500 h-full transition-all"
                        style={{
                          width: `${(assignmentStats.completed / assignmentStats.total) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground p-8">
                No assignment data available
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
                      <TableHead className="text-right">Assignments</TableHead>
                      <TableHead className="text-right">Completion %</TableHead>
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
                            {branchMetrics.totalAssignments}
                          </TableCell>
                          <TableCell className="text-right">
                            {branchMetrics.totalAssignments > 0
                              ? Math.round(
                                  (branchMetrics.completedAssignments /
                                    branchMetrics.totalAssignments) *
                                    100
                                )
                              : 0}
                            %
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
    </Card>
  )
}

export default BranchAnalytics

