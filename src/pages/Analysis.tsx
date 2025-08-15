import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
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

const allowedBranches = [
  'Gayaza', 'Kira', 'Burton street', 'Gulu', 'Jinja 1', 'Jinja 2', 'Kabalagala', 'Kansanga', 'Kiruddu', 'Kisementi', 'Kintintale', 'Mbale', 'Mbarara', 'Naalya', 'Mukono', 'Munyonyo', 'Najjera', 'Ntinda', 'Wandegeya'
];

const Analysis = () => {
  const { user } = useAuth()
  const { userRole, loading: roleLoading } = useUserRole()
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
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
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

  const canAccessAnalysis = userRole && ['admin', 'system_admin', 'regional_manager', 'branch_system_admin'].includes(userRole)

  const loadBranches = useCallback(async () => {
    try {
      const allowedBranches = [
        'Gayaza', 'Kira', 'Burton street', 'Gulu', 'Jinja 1', 'Jinja 2', 
        'Kabalagala', 'Kansanga', 'Kiruddu', 'Kisementi', 'Kintintale', 
        'Mbale', 'Mbarara', 'Naalya', 'Mukono', 'Munyonyo', 'Najjera', 
        'Ntinda', 'Wandegeya', 'Bbunga'
      ];

      // First, let's get all branches to see what we have
      const { data: allBranches, error: fetchError } = await supabase
        .from('branches')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      console.log('All branch names:', allBranches?.map(b => b.name));

      // Check if Bbunga exists
      const hasBbunga = allBranches?.some(b => b.name.toLowerCase() === 'bbunga');
      console.log('Has Bbunga:', hasBbunga);

      // If Bbunga doesn't exist, add it
      if (!hasBbunga) {
        console.log('Adding Bbunga branch...');
        const { data: insertedBbunga, error: insertError } = await supabase
          .from('branches')
          .insert({
            name: 'Bbunga',
            code: 'BBUNGA',
            region: 'Central'
          })
          .select();

        if (insertError) {
          console.error('Error inserting Bbunga:', insertError);
          throw insertError;
        }
        console.log('Bbunga added:', insertedBbunga);
      }

      // Now get the final list of branches
      const { data: finalBranches, error: finalError } = await supabase
        .from('branches')
        .select('id, name, code, region')
        .in('name', allowedBranches)
        .order('name');

      if (finalError) throw finalError;

      console.log('Final branch names:', finalBranches?.map(b => b.name));
      setBranches(finalBranches || []);
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to load branches");
      console.error('Error loading branches:', errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [toast]);

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
        .from('stock_movement_history_view')
        .select('*')
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
      setBranchPerformance(Object.values(branchMetrics).filter(b => allowedBranches.includes(b.branchName)))
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

  useEffect(() => {
    if (canAccessAnalysis) {
      loadBranches()
      loadMetrics()
    }
  }, [canAccessAnalysis, loadBranches, loadMetrics]);

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
                      <BarChart data={branchPerformance.filter(b => allowedBranches.includes(b.branchName))}>
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
                            {branchPerformance.filter(b => allowedBranches.includes(b.branchName)).map(branch => (
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