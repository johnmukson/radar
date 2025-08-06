import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  Zap, 
  Building2, 
  Users, 
  TrendingUp,
  Award,
  Target
} from 'lucide-react'

interface Branch {
  id: string
  branch?: {
    name: string
    region: string
  }
  total_stock_value: number
}

interface Dispenser {
  id: string
  name?: string
  dispenser?: string
  branch?: string
  performance_score?: number
  completion_rate?: number
  completed_assignments?: number
  total_assignments?: number
}

interface PerformanceMetricsProps {
  metrics: {
    totalStockValue: number
    totalExpiredItems: number
    totalNearExpiry: number
    totalEmergencies: number
    activeBranches: number
    activeDispensers: number
    avgCompletionRate: number
  }
  topPerformers: {
    branches: Branch[]
    dispensers: Dispenser[]
  }
  hasSystemAccess: boolean
}

const PerformanceMetrics = ({ metrics, topPerformers, hasSystemAccess }: PerformanceMetricsProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Overall Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(metrics.totalStockValue)}</div>
                <p className="text-sm text-muted-foreground">Total Stock Value</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">{metrics.totalExpiredItems}</div>
                <p className="text-sm text-muted-foreground">Expired Items</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600">{metrics.totalNearExpiry}</div>
                <p className="text-sm text-muted-foreground">Near Expiry</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{metrics.avgCompletionRate}%</div>
                <p className="text-sm text-muted-foreground">Avg Completion Rate</p>
              </div>
              <Target className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{metrics.activeBranches}</div>
                <p className="text-sm text-muted-foreground">Active Branches</p>
              </div>
              <Building2 className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{metrics.activeDispensers}</div>
                <p className="text-sm text-muted-foreground">Active Dispensers</p>
              </div>
              <Users className="h-8 w-8 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{metrics.totalEmergencies}</div>
                <p className="text-sm text-muted-foreground">Emergency Assignments</p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      {hasSystemAccess && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Branches */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Top Performing Branches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topPerformers.branches.slice(0, 3).map((branch, index) => (
                  <div key={branch.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{branch.branch?.name || 'Unknown Branch'}</div>
                        <div className="text-sm text-muted-foreground">
                          {branch.branch?.region} Region
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(branch.total_stock_value)}</div>
                      <div className="text-sm text-muted-foreground">Stock Value</div>
                    </div>
                  </div>
                ))}
                {topPerformers.branches.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    No branch data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Dispensers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Top Performing Dispensers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topPerformers.dispensers.slice(0, 3).map((dispenser, index) => (
                  <div key={dispenser.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{dispenser.dispenser || dispenser.name}</div>
                        <div className="text-sm text-muted-foreground">{dispenser.branch || 'No Branch'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{dispenser.performance_score || dispenser.completion_rate}%</div>
                      <div className="text-sm text-muted-foreground">
                        Performance Score
                      </div>
                    </div>
                  </div>
                ))}
                {topPerformers.dispensers.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    No dispenser data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default PerformanceMetrics
