import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { useBranch } from '@/contexts/BranchContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Shield, Download, Share2, TrendingUp, TrendingDown, DollarSign, 
  Calendar, BarChart2, PieChart, LineChart, Target, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Percent, Clock, Activity
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts'
import { 
  formatUGX, 
  calculateROI, 
  calculateInventoryTurnover, 
  calculateDaysSalesOfInventory,
  calculateWastageRate,
  calculateEfficiencyScore
} from '@/utils/currency'
import { 
  calculateExpiryEfficiency, 
  getExpiryEfficiencyLevel,
  calculateExpiryTrends 
} from '@/utils/expiryEfficiency'
import { format } from 'date-fns'
import { extractErrorMessage } from '@/lib/utils'

interface AnalysisMetrics {
  totalValue: number
  potentialLoss: number
  moneySaved: number
  itemsExpired: number
  itemsNearExpiry: number
  totalStockItems: number
}

interface BranchPerformance {
  branchName: string
  totalValue: number
  itemsExpired: number
  itemsNearExpiry: number
  moneySaved: number
  potentialLoss: number
}

interface EfficiencyMetrics {
  wastageRate: number
  inventoryTurnover: number
  daysSalesOfInventory: number
  efficiencyScore: number
  roi: number
}

interface TrendAnalysis {
  period: string
  value: number
  trend: number
  forecast: number
}

interface ExpiryEfficiencyMetrics {
  expiryRiskScore: number;
  valuePreservationScore: number;
  earlyWarningScore: number;
  efficiencyScore: number;
  criticalRate: number;
  nearExpiryRate: number;
  expiredRate: number;
  criticalValueRate: number;
  nearExpiryValueRate: number;
  expiredValueRate: number;
}

const COLORS = ['#ff6384', '#ffb347', '#36a2eb', '#4bc0c0', '#9966ff', '#ffcd56']

const Analysis = () => {
  const { user } = useAuth()
  const { userRole, loading: roleLoading } = useUserRole()
  const { availableBranches } = useBranch()
  const [metrics, setMetrics] = useState<AnalysisMetrics>({
    totalValue: 0,
    potentialLoss: 0,
    moneySaved: 0,
    itemsExpired: 0,
    itemsNearExpiry: 0,
    totalStockItems: 0
  })
  const [branchPerformance, setBranchPerformance] = useState<BranchPerformance[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [loading, setLoading] = useState(true)
  
  // Use availableBranches directly - no need for separate state
  const branches = availableBranches.map(b => ({ id: b.id, name: b.name }))
  const { toast } = useToast()
  const [efficiencyMetrics, setEfficiencyMetrics] = useState<EfficiencyMetrics>({
    wastageRate: 0,
    inventoryTurnover: 0,
    daysSalesOfInventory: 0,
    efficiencyScore: 0,
    roi: 0
  })
  const [trends, setTrends] = useState<TrendAnalysis[]>([])
  const [comparisonPeriod, setComparisonPeriod] = useState('previous')
  const [expiryEfficiency, setExpiryEfficiency] = useState<ExpiryEfficiencyMetrics | null>(null)
  const [expiryTrends, setExpiryTrends] = useState<{
    trends: Array<{ date: string; value: number; change: number }>;
    averageChange: number;
    predictedValue: number;
  } | null>(null)
  const [monthlyHistory, setMonthlyHistory] = useState<Array<{
    period_start: string;
    period_end: string;
    total_stock_value: number;
    items_expired: number;
    items_near_expiry: number;
    emergency_assignments: number;
    tasks_completed: number;
    dispensers_active: number;
    items_sold: number;
    items_moved: number;
    total_movement_value: number;
  }>>([])
  const [dispenserHistory, setDispenserHistory] = useState<Array<{
    dispenser_id: string;
    dispenser_name: string;
    period_start: string;
    period_end: string;
    tasks_assigned: number;
    tasks_completed: number;
    tasks_pending: number;
    items_dispensed: number;
    items_moved: number;
    total_value_dispensed: number;
    completion_rate: number;
    performance_score: number;
  }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const canAccessAnalysis = userRole && ['admin', 'system_admin', 'regional_manager', 'branch_system_admin'].includes(userRole)

  // No need for loadBranches - availableBranches from BranchContext already handles everything
  // New branches will automatically appear when added to the database

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    try {
      // Calculate date ranges based on selected period
      const now = new Date()
      const startDate = new Date()
      if (selectedPeriod === 'month') {
        startDate.setMonth(now.getMonth() - 1)
      } else if (selectedPeriod === 'quarter') {
        startDate.setMonth(now.getMonth() - 3)
      } else if (selectedPeriod === 'year') {
        startDate.setFullYear(now.getFullYear() - 1)
      }

      // Build query based on user role and selected branch
      let query = supabase
        .from('stock_items')
        .select('*')

      if (selectedBranch !== 'all') {
        // We need to get the branch_id from the branches table
        const { data: branchData } = await supabase
          .from('branches')
          .select('id')
          .eq('name', selectedBranch)
          .single()
        
        if (branchData) {
          query = query.eq('branch_id', branchData.id)
        }
      } else if (userRole && !['system_admin', 'regional_manager'].includes(userRole)) {
        // This is tricky logic. Assuming non-admins are filtered by a branch elsewhere
        // or this logic needs to be tied to a user's specific branch.
        // For now, we leave it as is to avoid breaking intended functionality.
      }

      const { data: stockItems, error } = await query

      if (error) throw error

      // Calculate metrics
      const metrics: AnalysisMetrics = {
        totalValue: 0,
        potentialLoss: 0,
        moneySaved: 0,
        itemsExpired: 0,
        itemsNearExpiry: 0,
        totalStockItems: stockItems?.length || 0
      }

      const branchMetrics: { [key: string]: BranchPerformance } = {}

      stockItems?.forEach(item => {
        const expiryDate = new Date(item.expiry_date)
        const daysToExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const itemValue = item.quantity * item.unit_price

        metrics.totalValue += itemValue

        if (daysToExpiry < 0) {
          metrics.itemsExpired++
          metrics.potentialLoss += itemValue
        } else if (daysToExpiry <= 30) {
          metrics.itemsNearExpiry++
          metrics.potentialLoss += itemValue * 0.5 // Assuming 50% loss for near-expiry items
        }

        // Track branch performance
        if (!branchMetrics[item.branch]) {
          branchMetrics[item.branch] = {
            branchName: item.branch,
            totalValue: 0,
            itemsExpired: 0,
            itemsNearExpiry: 0,
            moneySaved: 0,
            potentialLoss: 0
          }
        }

        branchMetrics[item.branch].totalValue += itemValue
        if (daysToExpiry < 0) {
          branchMetrics[item.branch].itemsExpired++
          branchMetrics[item.branch].potentialLoss += itemValue
        } else if (daysToExpiry <= 30) {
          branchMetrics[item.branch].itemsNearExpiry++
          branchMetrics[item.branch].potentialLoss += itemValue * 0.5
        }
      })

      // Calculate money saved (items that were used before expiry)
      const { data: movementHistory, error: movementHistoryError } = await supabase
        .from('stock_movement_history')
        .select(`
          *,
          stock_items!inner(product_name, expiry_date, unit_price)
        `)
        .gte('movement_date', startDate.toISOString())

      if (movementHistoryError) throw movementHistoryError

      movementHistory?.forEach(movement => {
        if (movement.movement_type === 'used' || movement.movement_type === 'disposed') {
          const stockItem = stockItems?.find(item => item.id === movement.stock_item_id)
          if (stockItem) {
            const savedValue = movement.quantity_moved * stockItem.unit_price
            metrics.moneySaved += savedValue

            if (branchMetrics[stockItem.branch]) {
              branchMetrics[stockItem.branch].moneySaved += savedValue
            }
          }
        }
      })

      // Calculate efficiency metrics
      const wastageRate = calculateWastageRate(metrics.potentialLoss, metrics.totalValue)
      const inventoryTurnover = calculateInventoryTurnover(metrics.moneySaved, metrics.totalValue)
      const daysSalesOfInventory = calculateDaysSalesOfInventory(inventoryTurnover)
      const efficiencyScore = calculateEfficiencyScore(wastageRate, inventoryTurnover, daysSalesOfInventory)
      const roi = calculateROI(metrics.totalValue, metrics.moneySaved)

      setEfficiencyMetrics({
        wastageRate,
        inventoryTurnover,
        daysSalesOfInventory,
        efficiencyScore,
        roi
      })

      // Calculate expiry efficiency metrics
      const expiryMetrics = {
        criticalItems: metrics.itemsNearExpiry,
        nearExpiryItems: metrics.itemsNearExpiry,
        expiredItems: metrics.itemsExpired,
        totalItems: metrics.totalStockItems,
        criticalValue: metrics.potentialLoss * 0.5, // Assuming 50% of potential loss is from critical items
        nearExpiryValue: metrics.potentialLoss * 0.3, // 30% from near expiry
        expiredValue: metrics.potentialLoss * 0.2, // 20% from expired
        totalValue: metrics.totalValue
      }

      const expiryEfficiencyMetrics = calculateExpiryEfficiency(expiryMetrics)
      setExpiryEfficiency(expiryEfficiencyMetrics)

      // Calculate expiry trends
      const { data: historicalData, error: expiryHistoryError } = await supabase
        .from('stock_items')
        .select('*')
        .order('created_at', { ascending: true })

      if (expiryHistoryError) throw expiryHistoryError

      const trendsResult = calculateExpiryTrends(historicalData || [])
      setExpiryTrends(trendsResult)

      // Calculate trends
      const trendData: TrendAnalysis[] = branchPerformance.map(branch => ({
        period: branch.branchName,
        value: branch.totalValue,
        trend: ((branch.moneySaved - branch.potentialLoss) / branch.totalValue) * 100,
        forecast: branch.totalValue * (1 + (branch.moneySaved / branch.totalValue))
      }))

      setTrends(trendData)

      setMetrics(metrics)
      // Show all branches - no filtering needed, new branches will automatically appear
      setBranchPerformance(Object.values(branchMetrics))
      
      // Load monthly history if branch is selected
      if (selectedBranch !== 'all') {
        await loadMonthlyHistory()
        await loadDispenserHistory()
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, "Failed to load analysis metrics")
      console.error('Error loading metrics:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [selectedPeriod, selectedBranch, userRole, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMonthlyHistory = useCallback(async () => {
    if (selectedBranch === 'all') return
    
    setHistoryLoading(true)
    try {
      // Get branch_id from selectedBranch (it might be branch name or ID)
      let branchId = selectedBranch
      if (selectedBranch && !selectedBranch.includes('-')) {
        // It's a branch name, need to get ID
        const { data: branchData } = await supabase
          .from('branches')
          .select('id')
          .eq('name', selectedBranch)
          .single()
        
        if (branchData) {
          branchId = branchData.id
        } else {
          return
        }
      }

      const { data, error } = await supabase.rpc('get_monthly_history', {
        p_branch_id: branchId,
        p_months_back: 12
      })

      if (error) throw error
      setMonthlyHistory(data || [])
    } catch (error: any) {
      console.error('Error loading monthly history:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to load monthly history',
        variant: 'destructive'
      })
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedBranch, toast])

  const captureCurrentMonthSnapshot = useCallback(async () => {
    if (selectedBranch === 'all') {
      toast({
        title: 'Error',
        description: 'Please select a specific branch to capture snapshot',
        variant: 'destructive'
      })
      return
    }

    try {
      let branchId = selectedBranch
      if (selectedBranch && !selectedBranch.includes('-')) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('id')
          .eq('name', selectedBranch)
          .single()
        
        if (branchData) {
          branchId = branchData.id
        } else {
          throw new Error('Branch not found')
        }
      }

      // First capture branch snapshot
      const { data: branchData, error: branchError } = await supabase.rpc('capture_monthly_snapshot', {
        p_branch_id: branchId,
        p_month: null // Current month
      })

      if (branchError) throw branchError

      // Then capture dispenser snapshots
      const { error: dispenserError } = await supabase.rpc('capture_branch_dispensers_monthly_snapshot', {
        p_branch_id: branchId,
        p_month: null // Current month
      })

      if (dispenserError) {
        console.error('Error capturing dispenser snapshots:', dispenserError)
        // Don't fail if dispenser capture fails, just log it
      }

      toast({
        title: 'Success',
        description: 'Monthly snapshot captured successfully (branch and dispenser data)'
      })

      // Reload history
      await loadMonthlyHistory()
      await loadDispenserHistory()
    } catch (error: any) {
      console.error('Error capturing snapshot:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to capture monthly snapshot',
        variant: 'destructive'
      })
    }
  }, [selectedBranch, toast, loadMonthlyHistory])

  const loadDispenserHistory = useCallback(async () => {
    if (selectedBranch === 'all') return
    
    try {
      // Get branch_id from selectedBranch
      let branchId = selectedBranch
      if (selectedBranch && !selectedBranch.includes('-')) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('id')
          .eq('name', selectedBranch)
          .single()
        
        if (branchData) {
          branchId = branchData.id
        } else {
          return
        }
      }

      const { data, error } = await supabase.rpc('get_dispenser_monthly_history', {
        p_branch_id: branchId,
        p_dispenser_id: null, // Get all dispensers
        p_months_back: 12
      })

      if (error) throw error
      setDispenserHistory(data || [])
    } catch (error: any) {
      console.error('Error loading dispenser history:', error)
      // Don't show error toast for dispenser history, just log it
    }
  }, [selectedBranch])

  useEffect(() => {
    if (canAccessAnalysis) {
      loadMetrics()
    }
  }, [canAccessAnalysis, loadMetrics]);

  const handleDownload = () => {
    // Create CSV content
    const headers = ['Metric', 'Value']
    const rows = [
      ['Total Stock Value', `$${metrics.totalValue.toFixed(2)}`],
      ['Potential Loss', `$${metrics.potentialLoss.toFixed(2)}`],
      ['Money Saved', `$${metrics.moneySaved.toFixed(2)}`],
      ['Expired Items', metrics.itemsExpired.toString()],
      ['Near Expiry Items', metrics.itemsNearExpiry.toString()],
      ['Total Stock Items', metrics.totalStockItems.toString()]
    ]

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `stock-analysis-${selectedPeriod}-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const getStatusSummary = () => {
    if (metrics.potentialLoss > metrics.totalValue * 0.2 || metrics.itemsExpired > 10) {
      return {
        status: 'Critical',
        color: 'bg-red-100 text-red-800',
        icon: <AlertTriangle className="h-6 w-6" />,
        message: 'Immediate action required: High potential loss or many expired items.'
      }
    } else if (metrics.itemsNearExpiry > 5 || metrics.potentialLoss > metrics.totalValue * 0.05) {
      return {
        status: 'Attention Needed',
        color: 'bg-yellow-100 text-yellow-800',
        icon: <AlertTriangle className="h-6 w-6" />,
        message: 'Review near-expiry items to prevent losses.'
      }
    } else {
      return {
        status: 'All Good',
        color: 'bg-green-100 text-green-800',
        icon: <Shield className="h-6 w-6" />,
        message: 'No urgent actions required.'
      }
    }
  }

  const statusSummary = getStatusSummary()

  // Debug logging for expiry metrics
  useEffect(() => {
    console.log('expiryEfficiency changed:', expiryEfficiency);
  }, [expiryEfficiency]);
  console.log('expiryEfficiency:', expiryEfficiency);
  console.log('expiryTrends:', expiryTrends);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Please log in to access analysis.</p>
        </div>
      </div>
    )
  }

  if (!canAccessAnalysis) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Analysis</h1>
              <p className="text-muted-foreground">View detailed stock analysis and metrics</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Access denied. Only Administrators and Regional Managers can access analysis.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading analysis...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Analysis</h1>
            <p className="text-muted-foreground">View detailed stock analysis and metrics</p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Last Month</SelectItem>
                <SelectItem value="quarter">Last Quarter</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
              </SelectContent>
            </Select>
            {(userRole && ['system_admin', 'regional_manager'].includes(userRole)) && (
              <div className="flex items-center gap-4 mb-4">
                <Select
                  value={selectedBranch}
                  onValueChange={(value) => {
                    console.log('Selected branch:', value);
                    setSelectedBranch(value);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="expiry">Expiry Management</TabsTrigger>
            <TabsTrigger value="branch">Branch Performance</TabsTrigger>
            <TabsTrigger value="history">Monthly History</TabsTrigger>
            <TabsTrigger value="forecast">Forecast & Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatUGX(metrics.totalValue)}</div>
                  <p className="text-xs text-muted-foreground">
                    Current inventory value
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Potential Loss</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-500">{formatUGX(metrics.potentialLoss)}</div>
                  <p className="text-xs text-muted-foreground">
                    {efficiencyMetrics.wastageRate.toFixed(1)}% wastage rate
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Money Saved</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">{formatUGX(metrics.moneySaved)}</div>
                  <p className="text-xs text-muted-foreground">
                    {efficiencyMetrics.roi.toFixed(1)}% ROI
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Stock Status Distribution</CardTitle>
                  <CardDescription>
                    Current inventory status by value
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Expired', value: metrics.itemsExpired },
                            { name: 'Near Expiry', value: metrics.itemsNearExpiry },
                            { name: 'Good', value: metrics.totalStockItems - metrics.itemsExpired - metrics.itemsNearExpiry }
                          ]}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {COLORS.map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatUGX(value as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Value Distribution by Branch</CardTitle>
                  <CardDescription>
                    Total value and potential loss by branch
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={branchPerformance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="branchName" />
                        <YAxis tickFormatter={(value) => formatUGX(value)} />
                        <Tooltip formatter={(value) => formatUGX(value as number)} />
                        <Legend />
                        <Bar dataKey="totalValue" name="Total Value" fill="#8884d8" />
                        <Bar dataKey="potentialLoss" name="Potential Loss" fill="#ff8042" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="expiry" className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <Select
                value={selectedBranch}
                onValueChange={(value) => {
                  console.log('Selected branch:', value);
                  setSelectedBranch(value);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {expiryEfficiency ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Expiry Risk Score</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{expiryEfficiency.expiryRiskScore.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground">
                        {getExpiryEfficiencyLevel(expiryEfficiency.expiryRiskScore).description}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Value Preservation</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{expiryEfficiency.valuePreservationScore.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground">
                        Value protected from expiry
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Early Warning Score</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{expiryEfficiency.earlyWarningScore.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground">
                        Effectiveness of early detection
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Expiry Management Efficiency</CardTitle>
                    <CardDescription>
                      Overall performance in managing product expiry
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold">
                          {expiryEfficiency.efficiencyScore.toFixed(1)}%
                        </div>
                        <div className={getExpiryEfficiencyLevel(expiryEfficiency.efficiencyScore).color}>
                          {getExpiryEfficiencyLevel(expiryEfficiency.efficiencyScore).level}
                        </div>
                      </div>
                      <Progress value={expiryEfficiency.efficiencyScore} className="w-full" />
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-medium">Critical Items</div>
                          <div className="text-muted-foreground">
                            {expiryEfficiency.criticalRate.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">Near Expiry</div>
                          <div className="text-muted-foreground">
                            {expiryEfficiency.nearExpiryRate.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">Expired</div>
                          <div className="text-muted-foreground">
                            {expiryEfficiency.expiredRate.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Value at Risk by Month</CardTitle>
                      <CardDescription>
                        Track how much value is at risk of expiry each month
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        {expiryTrends && Array.isArray(expiryTrends.trends) && expiryTrends.trends.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={expiryTrends.trends}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="period" />
                              <YAxis />
                              <Tooltip formatter={(value: number) => `UGX ${value.toLocaleString()}`} />
                              <Legend />
                              <Bar dataKey="expiredValue" name="Expired Value" fill="#ff6384" />
                              <Bar dataKey="criticalValue" name="Critical Value" fill="#ffb347" />
                              <Bar dataKey="nearExpiryValue" name="Near Expiry Value" fill="#36a2eb" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="text-center text-muted-foreground py-8">
                            No expiry trend data available.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Expiry Trends by Month</CardTitle>
                      <CardDescription>
                        See how expiry rates change over time
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        {expiryTrends && Array.isArray(expiryTrends.trends) && expiryTrends.trends.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={expiryTrends.trends}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="period" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="expiredRate" name="Expired %" stroke="#ff6384" />
                              <Line type="monotone" dataKey="criticalRate" name="Critical %" stroke="#ffb347" />
                              <Line type="monotone" dataKey="nearExpiryRate" name="Near Expiry %" stroke="#36a2eb" />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="text-center text-muted-foreground py-8">
                            No expiry trend data available.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-8">
                  <Card>
                    <CardHeader>
                      <CardTitle>Branch Expiry Breakdown</CardTitle>
                      <CardDescription>Expiry risk and value at risk per branch</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="p-2">Branch</th>
                              <th className="p-2">Critical Items (%)</th>
                              <th className="p-2">Near Expiry (%)</th>
                              <th className="p-2">Expired (%)</th>
                              <th className="p-2">Value at Risk</th>
                            </tr>
                          </thead>
                          <tbody>
                            {branchPerformance.map(branch => (
                              <tr key={branch.branchName}>
                                <td className="p-2 font-medium">{branch.branchName}</td>
                                <td className="p-2">{branch.itemsNearExpiry}</td>
                                <td className="p-2">{branch.itemsNearExpiry}</td>
                                <td className="p-2">{branch.itemsExpired}</td>
                                <td className="p-2">UGX {branch.potentialLoss.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <div>No expiry management data available yet.</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="branch" className="space-y-4">
            {branchPerformance.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart2 />
                    Branch Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={branchPerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="branchName" />
                      <YAxis tickFormatter={(value) => formatUGX(value)} />
                      <Tooltip formatter={(value) => formatUGX(value as number)} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                <BarChart2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <div>No branch performance data available yet.</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Monthly History</CardTitle>
                    <CardDescription>
                      Track performance metrics month-over-month for the selected branch. 
                      <span className="font-semibold text-green-600"> History records are preserved even when stock items are deleted.</span>
                    </CardDescription>
                  </div>
                  {selectedBranch !== 'all' && (
                    <Button onClick={captureCurrentMonthSnapshot} variant="outline">
                      <Calendar className="h-4 w-4 mr-2" />
                      Capture Current Month
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedBranch === 'all' ? (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Please select a specific branch to view monthly history.
                    </AlertDescription>
                  </Alert>
                ) : historyLoading ? (
                  <div className="text-center py-8">
                    <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">Loading monthly history...</p>
                  </div>
                ) : monthlyHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-2">No Monthly History Available</p>
                    <p className="text-muted-foreground mb-4">
                      Capture your first monthly snapshot to start tracking history over time.
                    </p>
                    <Button onClick={captureCurrentMonthSnapshot}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Capture Current Month Snapshot
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Monthly History Chart */}
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyHistory.map(h => ({
                          month: format(new Date(h.period_start), 'MMM yyyy'),
                          stockValue: parseFloat(h.total_stock_value?.toString() || '0'),
                          itemsExpired: h.items_expired || 0,
                          itemsNearExpiry: h.items_near_expiry || 0,
                          itemsSold: h.items_sold || 0,
                          movementValue: parseFloat(h.total_movement_value?.toString() || '0')
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis yAxisId="left" />
                          <YAxis yAxisId="right" orientation="right" />
                          <Tooltip 
                            formatter={(value: number, name: string) => {
                              if (name === 'stockValue' || name === 'movementValue') {
                                return formatUGX(value)
                              }
                              return value
                            }}
                          />
                          <Legend />
                          <Area 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="stockValue" 
                            name="Stock Value" 
                            stroke="#36a2eb" 
                            fill="#36a2eb" 
                            fillOpacity={0.6}
                          />
                          <Area 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="itemsExpired" 
                            name="Items Expired" 
                            stroke="#ff6384" 
                            fill="#ff6384" 
                            fillOpacity={0.6}
                          />
                          <Area 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="itemsNearExpiry" 
                            name="Items Near Expiry" 
                            stroke="#ffb347" 
                            fill="#ffb347" 
                            fillOpacity={0.6}
                          />
                          <Area 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="movementValue" 
                            name="Movement Value" 
                            stroke="#4bc0c0" 
                            fill="#4bc0c0" 
                            fillOpacity={0.6}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Monthly History Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="p-3 font-medium">Month</th>
                            <th className="p-3 font-medium">Stock Value</th>
                            <th className="p-3 font-medium">Expired</th>
                            <th className="p-3 font-medium">Near Expiry</th>
                            <th className="p-3 font-medium">Items Sold</th>
                            <th className="p-3 font-medium">Movement Value</th>
                            <th className="p-3 font-medium">Tasks Completed</th>
                            <th className="p-3 font-medium">Active Dispensers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyHistory.map((month, index) => {
                            const prevMonth = monthlyHistory[index + 1]
                            const stockValueChange = prevMonth 
                              ? ((parseFloat(month.total_stock_value?.toString() || '0') - parseFloat(prevMonth.total_stock_value?.toString() || '0')) / parseFloat(prevMonth.total_stock_value?.toString() || '1')) * 100
                              : 0
                            
                            return (
                              <tr key={month.period_start} className="border-b">
                                <td className="p-3 font-medium">
                                  {format(new Date(month.period_start), 'MMM yyyy')}
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <span>{formatUGX(parseFloat(month.total_stock_value?.toString() || '0'))}</span>
                                    {prevMonth && (
                                      <span className={`text-xs ${stockValueChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {stockValueChange >= 0 ? '↑' : '↓'} {Math.abs(stockValueChange).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3">{month.items_expired || 0}</td>
                                <td className="p-3">{month.items_near_expiry || 0}</td>
                                <td className="p-3">{month.items_sold || 0}</td>
                                <td className="p-3">{formatUGX(parseFloat(month.total_movement_value?.toString() || '0'))}</td>
                                <td className="p-3">{month.tasks_completed || 0}</td>
                                <td className="p-3">{month.dispensers_active || 0}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Dispenser History Section */}
                    {dispenserHistory.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Dispenser Performance History</CardTitle>
                          <CardDescription>
                            Monthly performance metrics for all dispensers. This history is preserved even when stock items are deleted.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {/* Group dispenser history by month */}
                            {(() => {
                              const groupedByMonth = dispenserHistory.reduce((acc, record) => {
                                const monthKey = format(new Date(record.period_start), 'MMM yyyy')
                                if (!acc[monthKey]) {
                                  acc[monthKey] = []
                                }
                                acc[monthKey].push(record)
                                return acc
                              }, {} as Record<string, typeof dispenserHistory>)

                              return Object.entries(groupedByMonth).map(([month, records]) => (
                                <div key={month} className="border rounded-lg p-4">
                                  <h3 className="font-semibold mb-3 text-lg">{month}</h3>
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-left text-sm">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="p-2 font-medium">Dispenser</th>
                                          <th className="p-2 font-medium">Tasks Assigned</th>
                                          <th className="p-2 font-medium">Tasks Completed</th>
                                          <th className="p-2 font-medium">Completion Rate</th>
                                          <th className="p-2 font-medium">Items Dispensed</th>
                                          <th className="p-2 font-medium">Value Dispensed</th>
                                          <th className="p-2 font-medium">Performance Score</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {records.map((record) => (
                                          <tr key={`${record.dispenser_id}-${record.period_start}`} className="border-b">
                                            <td className="p-2 font-medium">{record.dispenser_name || 'Unknown'}</td>
                                            <td className="p-2">{record.tasks_assigned || 0}</td>
                                            <td className="p-2">{record.tasks_completed || 0}</td>
                                            <td className="p-2">
                                              <div className="flex items-center gap-2">
                                                <span>{record.completion_rate?.toFixed(1) || 0}%</span>
                                                <Progress 
                                                  value={record.completion_rate || 0} 
                                                  className="w-16 h-2"
                                                />
                                              </div>
                                            </td>
                                            <td className="p-2">{record.items_dispensed || 0}</td>
                                            <td className="p-2">{formatUGX(parseFloat(record.total_value_dispensed?.toString() || '0'))}</td>
                                            <td className="p-2">
                                              <Badge 
                                                variant={
                                                  (record.performance_score || 0) >= 80 ? 'default' :
                                                  (record.performance_score || 0) >= 60 ? 'secondary' : 'destructive'
                                                }
                                              >
                                                {record.performance_score?.toFixed(1) || 0}
                                              </Badge>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forecast" className="space-y-4">
            {trends.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Trend Analysis & Forecast</CardTitle>
                  <CardDescription>
                    Historical trends and future projections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis tickFormatter={(value) => formatUGX(value)} />
                        <Tooltip formatter={(value) => formatUGX(value as number)} />
                        <Legend />
                        <Area type="monotone" dataKey="value" name="Current Value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                        <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                <TrendingUp className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <div>No forecast or trend data available yet.</div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default Analysis 