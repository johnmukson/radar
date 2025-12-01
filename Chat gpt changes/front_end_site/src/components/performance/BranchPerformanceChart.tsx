
import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Building2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

interface BranchPerformance {
  id: string
  branch_id: string
  total_stock_value: number
  items_expired: number
  items_near_expiry: number
  emergency_assignments: number
  tasks_completed: number
  dispensers_active: number
  branch?: {
    name: string
    code: string
    region: string
  }
}

interface BranchPerformanceChartProps {
  data: BranchPerformance[]
  hasSystemAccess: boolean
}

const BranchPerformanceChart = ({ data, hasSystemAccess }: BranchPerformanceChartProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getPerformanceScore = (branch: BranchPerformance) => {
    const stockValue = branch.total_stock_value
    const expiredPenalty = branch.items_expired * 100
    const nearExpiryPenalty = branch.items_near_expiry * 50
    const emergencyPenalty = branch.emergency_assignments * 75
    const completionBonus = branch.tasks_completed * 25
    const dispenserBonus = branch.dispensers_active * 50

    const score = stockValue + completionBonus + dispenserBonus - expiredPenalty - nearExpiryPenalty - emergencyPenalty
    return Math.max(0, score)
  }

  const getPerformanceLevel = (score: number, maxScore: number) => {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0
    if (percentage >= 80) return { level: 'Excellent', color: 'bg-green-500', textColor: 'text-green-700' }
    if (percentage >= 60) return { level: 'Good', color: 'bg-blue-500', textColor: 'text-blue-700' }
    if (percentage >= 40) return { level: 'Average', color: 'bg-yellow-500', textColor: 'text-yellow-700' }
    return { level: 'Needs Improvement', color: 'bg-red-500', textColor: 'text-red-700' }
  }

  const sortedData = [...data].sort((a, b) => getPerformanceScore(b) - getPerformanceScore(a))
  const maxScore = sortedData.length > 0 ? getPerformanceScore(sortedData[0]) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Branch Performance Rankings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedData.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No branch performance data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead className="text-center">Expired</TableHead>
                  <TableHead className="text-center">Near Expiry</TableHead>
                  <TableHead className="text-center">Emergencies</TableHead>
                  <TableHead className="text-center">Tasks Done</TableHead>
                  <TableHead className="text-center">Active Dispensers</TableHead>
                  <TableHead>Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((branch, index) => {
                  const score = getPerformanceScore(branch)
                  const performance = getPerformanceLevel(score, maxScore)
                  
                  return (
                    <TableRow key={branch.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                            index === 0 ? 'bg-yellow-500' : 
                            index === 1 ? 'bg-gray-400' : 
                            index === 2 ? 'bg-orange-500' : 'bg-gray-600'
                          }`}>
                            {index + 1}
                          </div>
                          {index < 3 && (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{branch.branch?.name || 'Unknown Branch'}</div>
                          <div className="text-sm text-muted-foreground">{branch.branch?.code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{branch.branch?.region || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(branch.total_stock_value)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {branch.items_expired > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          <span className={branch.items_expired > 0 ? 'text-red-600 font-medium' : ''}>
                            {branch.items_expired}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {branch.items_near_expiry > 5 && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                          <span className={branch.items_near_expiry > 5 ? 'text-orange-600 font-medium' : ''}>
                            {branch.items_near_expiry}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={branch.emergency_assignments > 0 ? 'text-red-600 font-medium' : ''}>
                          {branch.emergency_assignments}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-medium">{branch.tasks_completed}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-blue-600 font-medium">{branch.dispensers_active}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={performance.textColor}>
                          {performance.level}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default BranchPerformanceChart
