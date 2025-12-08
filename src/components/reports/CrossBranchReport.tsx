import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Building2, 
  Package, 
  DollarSign, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Users,
  Activity,
  Download,
  FileText,
  Filter
} from 'lucide-react'
import { format } from 'date-fns'
import { formatUGX } from '@/utils/currency'

interface BranchReportData {
  branchId: string
  branchName: string
  branchCode: string
  region: string | null
  totalItems: number
  totalValue: number
  expiringSoon: number
  expired: number
  lowStockItems: number
  highValueItems: number
  totalAssignments: number
  pendingAssignments: number
  completedAssignments: number
  inProgressAssignments: number
  completionRate: number
  averageItemValue: number
  totalQuantity: number
}

interface AggregateStatistics {
  totalBranches: number
  totalItems: number
  totalValue: number
  totalExpiringSoon: number
  totalExpired: number
  totalLowStock: number
  totalHighValue: number
  totalAssignments: number
  totalPending: number
  totalCompleted: number
  totalInProgress: number
  averageCompletionRate: number
  averageItemsPerBranch: number
  averageValuePerBranch: number
  highestValueBranch: string
  lowestValueBranch: string
  mostAssignmentsBranch: string
  bestCompletionRateBranch: string
}

const CrossBranchReport: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager, availableBranches } = useBranch()
  const { userRole } = useUserRole()
  const [loading, setLoading] = useState(true)
  const [branchData, setBranchData] = useState<BranchReportData[]>([])
  const [aggregateStats, setAggregateStats] = useState<AggregateStatistics | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'items' | 'completion'>('value')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const hasAccess = isSystemAdmin || isRegionalManager

  useEffect(() => {
    const fetchBranchData = async () => {
      if (!hasAccess) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const branchesToFetch = isSystemAdmin ? availableBranches : [selectedBranch].filter(Boolean)
        console.log('🔍 CrossBranchReport: Fetching data for branches:', branchesToFetch.length)
        const allBranchData: BranchReportData[] = []

        for (const branch of branchesToFetch) {
          if (!branch) continue

          console.log(`🔍 CrossBranchReport: Fetching stock for branch: ${branch.name} (${branch.id})`)
          const { data: stockItems, error: stockError } = await supabase
            .from('stock_items')
            .select('*')
            .eq('branch_id', branch.id)

          console.log(`📊 CrossBranchReport: Branch ${branch.name} - Stock items:`, {
            count: stockItems?.length || 0,
            error: stockError
          })

          if (stockError) {
            console.error(`❌ CrossBranchReport: Error fetching stock for ${branch.name}:`, stockError)
            continue
          }

          // Filter out items with quantity 0 (completed/out of stock items)
          const activeStockItems = (stockItems || []).filter(item => (item.quantity || 0) > 0)
          const stockItemIds = activeStockItems.map(item => item.id) || []
          let assignments: any[] = []
          if (stockItemIds.length > 0) {
            const { data: assignmentData } = await supabase
              .from('emergency_assignments')
              .select('*')
              .in('stock_item_id', stockItemIds)
            assignments = assignmentData || []
          }

          const now = new Date()
          const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

          // Use activeStockItems (filtered to exclude quantity 0) for all calculations
          const totalItems = activeStockItems?.length || 0
          const totalQuantity = activeStockItems?.reduce((sum, item) => sum + item.quantity, 0) || 0
          const totalValue = activeStockItems?.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) || 0
          const expiringSoon = activeStockItems?.filter(item => {
            const expiryDate = new Date(item.expiry_date)
            return expiryDate >= now && expiryDate <= thirtyDaysFromNow
          }).length || 0
          const expired = activeStockItems?.filter(item => {
            const expiryDate = new Date(item.expiry_date)
            return expiryDate < now
          }).length || 0
          const lowStockItems = activeStockItems?.filter(item => item.quantity < 10).length || 0
          const highValueItems = activeStockItems?.filter(item => (item.quantity * item.unit_price) > 100000).length || 0

          const totalAssignments = assignments.length
          const pendingAssignments = assignments.filter(a => a.status === 'pending').length
          const completedAssignments = assignments.filter(a => a.status === 'completed').length
          const inProgressAssignments = totalAssignments - pendingAssignments - completedAssignments
          const completionRate = totalAssignments > 0 
            ? Math.round((completedAssignments / totalAssignments) * 100) 
            : 0
          const averageItemValue = totalItems > 0 ? totalValue / totalItems : 0

          allBranchData.push({
            branchId: branch.id,
            branchName: branch.name,
            branchCode: branch.code,
            region: branch.region,
            totalItems,
            totalValue,
            expiringSoon,
            expired,
            lowStockItems,
            highValueItems,
            totalAssignments,
            pendingAssignments,
            completedAssignments,
            inProgressAssignments,
            completionRate,
            averageItemValue,
            totalQuantity
          })
        }

        setBranchData(allBranchData)

        if (allBranchData.length > 0) {
          const totalBranches = allBranchData.length
          const totalItems = allBranchData.reduce((sum, b) => sum + b.totalItems, 0)
          const totalValue = allBranchData.reduce((sum, b) => sum + b.totalValue, 0)
          const totalExpiringSoon = allBranchData.reduce((sum, b) => sum + b.expiringSoon, 0)
          const totalExpired = allBranchData.reduce((sum, b) => sum + b.expired, 0)
          const totalLowStock = allBranchData.reduce((sum, b) => sum + b.lowStockItems, 0)
          const totalHighValue = allBranchData.reduce((sum, b) => sum + b.highValueItems, 0)
          const totalAssignments = allBranchData.reduce((sum, b) => sum + b.totalAssignments, 0)
          const totalPending = allBranchData.reduce((sum, b) => sum + b.pendingAssignments, 0)
          const totalCompleted = allBranchData.reduce((sum, b) => sum + b.completedAssignments, 0)
          const totalInProgress = allBranchData.reduce((sum, b) => sum + b.inProgressAssignments, 0)
          const averageCompletionRate = totalBranches > 0
            ? Math.round(allBranchData.reduce((sum, b) => sum + b.completionRate, 0) / totalBranches)
            : 0
          const averageItemsPerBranch = totalBranches > 0 ? Math.round(totalItems / totalBranches) : 0
          const averageValuePerBranch = totalBranches > 0 ? totalValue / totalBranches : 0

          const highestValueBranch = allBranchData.reduce((max, b) => 
            b.totalValue > max.totalValue ? b : max
          , allBranchData[0])
          const lowestValueBranch = allBranchData.reduce((min, b) => 
            b.totalValue < min.totalValue ? b : min
          , allBranchData[0])
          const mostAssignmentsBranch = allBranchData.reduce((max, b) => 
            b.totalAssignments > max.totalAssignments ? b : max
          , allBranchData[0])
          const bestCompletionRateBranch = allBranchData.reduce((max, b) => 
            b.completionRate > max.completionRate ? b : max
          , allBranchData[0])

          setAggregateStats({
            totalBranches,
            totalItems,
            totalValue,
            totalExpiringSoon,
            totalExpired,
            totalLowStock,
            totalHighValue,
            totalAssignments,
            totalPending,
            totalCompleted,
            totalInProgress,
            averageCompletionRate,
            averageItemsPerBranch,
            averageValuePerBranch,
            highestValueBranch: highestValueBranch.branchName,
            lowestValueBranch: lowestValueBranch.branchName,
            mostAssignmentsBranch: mostAssignmentsBranch.branchName,
            bestCompletionRateBranch: bestCompletionRateBranch.branchName
          })
        }

      } catch (error) {
        console.error('Error fetching branch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBranchData()
  }, [hasAccess, isSystemAdmin, availableBranches, selectedBranch])

  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>()
    branchData.forEach(branch => {
      if (branch.region) {
        regions.add(branch.region)
      }
    })
    return Array.from(regions).sort()
  }, [branchData])

  const filteredAndSortedData = useMemo(() => {
    let filtered = branchData

    if (selectedRegion !== 'all') {
      filtered = filtered.filter(branch => branch.region === selectedRegion)
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.branchName.localeCompare(b.branchName)
          break
        case 'value':
          comparison = a.totalValue - b.totalValue
          break
        case 'items':
          comparison = a.totalItems - b.totalItems
          break
        case 'completion':
          comparison = a.completionRate - b.completionRate
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [branchData, selectedRegion, sortBy, sortOrder])

  const exportToCSV = () => {
    const headers = [
      'Branch Name',
      'Branch Code',
      'Region',
      'Total Items',
      'Total Quantity',
      'Total Value',
      'Average Item Value',
      'Expiring Soon (30 days)',
      'Expired Items',
      'Low Stock Items',
      'High Value Items',
      'Total Assignments',
      'Pending Assignments',
      'In Progress Assignments',
      'Completed Assignments',
      'Completion Rate (%)'
    ]

    const rows = filteredAndSortedData.map(branch => [
      branch.branchName,
      branch.branchCode,
      branch.region || 'N/A',
      branch.totalItems.toString(),
      branch.totalQuantity.toString(),
      formatUGX(branch.totalValue),
      formatUGX(branch.averageItemValue),
      branch.expiringSoon.toString(),
      branch.expired.toString(),
      branch.lowStockItems.toString(),
      branch.highValueItems.toString(),
      branch.totalAssignments.toString(),
      branch.pendingAssignments.toString(),
      branch.inProgressAssignments.toString(),
      branch.completedAssignments.toString(),
      branch.completionRate.toString() + '%'
    ])

    if (aggregateStats) {
      rows.push([])
      rows.push(['AGGREGATE STATISTICS'])
      rows.push(['Total Branches', aggregateStats.totalBranches.toString()])
      rows.push(['Total Items', aggregateStats.totalItems.toString()])
      rows.push(['Total Value', formatUGX(aggregateStats.totalValue)])
      rows.push(['Total Expiring Soon', aggregateStats.totalExpiringSoon.toString()])
      rows.push(['Total Expired', aggregateStats.totalExpired.toString()])
      rows.push(['Total Low Stock', aggregateStats.totalLowStock.toString()])
      rows.push(['Total High Value Items', aggregateStats.totalHighValue.toString()])
      rows.push(['Total Assignments', aggregateStats.totalAssignments.toString()])
      rows.push(['Total Pending', aggregateStats.totalPending.toString()])
      rows.push(['Total Completed', aggregateStats.totalCompleted.toString()])
      rows.push(['Average Completion Rate', aggregateStats.averageCompletionRate.toString() + '%'])
      rows.push(['Average Items Per Branch', aggregateStats.averageItemsPerBranch.toString()])
      rows.push(['Average Value Per Branch', formatUGX(aggregateStats.averageValuePerBranch)])
      rows.push(['Highest Value Branch', aggregateStats.highestValueBranch])
      rows.push(['Lowest Value Branch', aggregateStats.lowestValueBranch])
      rows.push(['Most Assignments Branch', aggregateStats.mostAssignmentsBranch])
      rows.push(['Best Completion Rate Branch', aggregateStats.bestCompletionRateBranch])
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', `cross_branch_report_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!hasAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cross-Branch Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have access to cross-branch reports. This feature is only available to system administrators and regional managers.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cross-Branch Report
          </CardTitle>
          <CardDescription>Loading cross-branch data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6" />
            Cross-Branch Report
          </CardTitle>
          <CardDescription>
            Comprehensive cross-branch analytics and statistics
            {isSystemAdmin ? ' (All Branches)' : ' (Regional View)'}
          </CardDescription>
        </div>
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="branches">Branch Details</TabsTrigger>
            <TabsTrigger value="aggregate">Aggregate Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {aggregateStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Branches
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-500" />
                      <div className="text-2xl font-bold">{aggregateStats.totalBranches}</div>
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
                      <div className="text-2xl font-bold">{formatUGX(aggregateStats.totalValue)}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-purple-500" />
                      <div className="text-2xl font-bold">{aggregateStats.totalItems}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Average Completion Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-blue-500" />
                      <div className="text-2xl font-bold">{aggregateStats.averageCompletionRate}%</div>
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
                      <div className="text-2xl font-bold">{aggregateStats.totalExpiringSoon}</div>
                      {aggregateStats.totalExpired > 0 && (
                        <Badge variant="destructive" className="ml-2">
                          {aggregateStats.totalExpired} expired
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
                      <div className="text-2xl font-bold">{aggregateStats.totalAssignments}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Low Stock Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-orange-500" />
                      <div className="text-2xl font-bold">{aggregateStats.totalLowStock}</div>
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
                      <div className="text-2xl font-bold">{aggregateStats.totalHighValue}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="branches" className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filter:</span>
              </div>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {uniqueRegions.map(region => (
                    <SelectItem key={region} value={region}>{region}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sort by:</span>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Branch Name</SelectItem>
                    <SelectItem value="value">Total Value</SelectItem>
                    <SelectItem value="items">Total Items</SelectItem>
                    <SelectItem value="completion">Completion Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Expiring Soon</TableHead>
                  <TableHead className="text-right">Assignments</TableHead>
                  <TableHead className="text-right">Completion %</TableHead>
                  <TableHead className="text-right">Low Stock</TableHead>
                  <TableHead className="text-right">High Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No branch data available
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedData.map((branch) => (
                    <TableRow key={branch.branchId}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <div>
                            <div>{branch.branchName}</div>
                            <div className="text-xs text-muted-foreground">
                              {branch.branchCode} {branch.region && `• ${branch.region}`}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{branch.totalItems}</TableCell>
                      <TableCell className="text-right">{formatUGX(branch.totalValue)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {branch.expiringSoon}
                          {branch.expired > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {branch.expired}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span>{branch.totalAssignments}</span>
                          {branch.pendingAssignments > 0 && (
                            <span className="text-xs text-yellow-600">
                              {branch.pendingAssignments} pending
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={branch.completionRate >= 80 ? 'default' : 'secondary'}>
                          {branch.completionRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {branch.lowStockItems > 0 ? (
                          <Badge variant="outline" className="text-orange-600">
                            {branch.lowStockItems}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {branch.highValueItems > 0 ? (
                          <Badge variant="outline" className="text-green-600">
                            {branch.highValueItems}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="aggregate" className="space-y-4">
            {aggregateStats ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Summary Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Branches:</span>
                        <span className="font-semibold">{aggregateStats.totalBranches}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Items:</span>
                        <span className="font-semibold">{aggregateStats.totalItems}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Value:</span>
                        <span className="font-semibold">{formatUGX(aggregateStats.totalValue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Average Items/Branch:</span>
                        <span className="font-semibold">{aggregateStats.averageItemsPerBranch}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Average Value/Branch:</span>
                        <span className="font-semibold">{formatUGX(aggregateStats.averageValuePerBranch)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Assignment Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Assignments:</span>
                        <span className="font-semibold">{aggregateStats.totalAssignments}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pending:</span>
                        <span className="font-semibold text-yellow-600">{aggregateStats.totalPending}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">In Progress:</span>
                        <span className="font-semibold text-blue-600">{aggregateStats.totalInProgress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="font-semibold text-green-600">{aggregateStats.totalCompleted}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Average Completion Rate:</span>
                        <span className="font-semibold">{aggregateStats.averageCompletionRate}%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Stock Health</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expiring Soon (30 days):</span>
                        <span className="font-semibold text-yellow-600">{aggregateStats.totalExpiringSoon}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expired Items:</span>
                        <span className="font-semibold text-red-600">{aggregateStats.totalExpired}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Low Stock Items:</span>
                        <span className="font-semibold text-orange-600">{aggregateStats.totalLowStock}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">High Value Items:</span>
                        <span className="font-semibold text-green-600">{aggregateStats.totalHighValue}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Top Performers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Highest Value:</span>
                        <span className="font-semibold">{aggregateStats.highestValueBranch}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lowest Value:</span>
                        <span className="font-semibold">{aggregateStats.lowestValueBranch}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Most Assignments:</span>
                        <span className="font-semibold">{aggregateStats.mostAssignmentsBranch}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Best Completion Rate:</span>
                        <span className="font-semibold">{aggregateStats.bestCompletionRateBranch}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground p-8">
                No aggregate statistics available
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default CrossBranchReport
