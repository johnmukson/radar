import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Sparkles, 
  RefreshCw, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Package,
  Eye,
  X
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import AiChatInterface from './AiChatInterface'

interface AiRecommendation {
  id: string
  branch_id: string | null
  recommendation_type: string
  title: string
  recommendation: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'reviewed' | 'implemented' | 'dismissed'
  metadata: Record<string, any>
  impact_score: number
  estimated_savings: number | null
  estimated_time_savings: number | null
  related_stock_items: string[] | null
  created_at: string
  updated_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  implemented_at: string | null
  implemented_by: string | null
}

const AiRecommendationsManager: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess } = useUserRole()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([])
  const [selectedRecommendation, setSelectedRecommendation] = useState<AiRecommendation | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [showForecast, setShowForecast] = useState(false)
  const [forecastData, setForecastData] = useState<any>(null)
  const [loadingForecast, setLoadingForecast] = useState(false)

  const canViewRecommendations = hasAdminAccess || isSystemAdmin || isRegionalManager

  // Debug logging
  useEffect(() => {
    console.log('AI Recommendations Manager mounted/updated:', {
      selectedBranch: selectedBranch?.name,
      isSystemAdmin,
      isRegionalManager,
      hasAdminAccess,
      canViewRecommendations,
      user: user?.email
    })
  }, [selectedBranch, isSystemAdmin, isRegionalManager, hasAdminAccess, canViewRecommendations, user])

  useEffect(() => {
    console.log('AI Recommendations Manager effect:', {
      selectedBranch: selectedBranch?.id,
      canViewRecommendations,
      filterStatus,
      filterPriority,
      filterType
    })
    
    if (selectedBranch && canViewRecommendations) {
      fetchRecommendations()
    } else {
      console.log('Skipping fetch - missing branch or permissions')
      setRecommendations([])
    }
  }, [selectedBranch, canViewRecommendations, filterStatus, filterPriority, filterType, filterMonth])

  const fetchRecommendations = async () => {
    if (!selectedBranch) {
      console.log('No branch selected, skipping fetch')
      return
    }

    setLoading(true)
    try {
      console.log('Fetching recommendations for branch:', selectedBranch.id)
      let query = supabase
        .from('ai_recommendations')
        .select('*')
        .eq('branch_id', selectedBranch.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus)
      }

      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority)
      }

      if (filterType !== 'all') {
        query = query.eq('recommendation_type', filterType)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching recommendations:', error)
        throw error
      }
      
      console.log('Fetched recommendations:', data?.length || 0)
      // Map and validate data to ensure correct types
      const typedRecommendations: AiRecommendation[] = (data || []).map((rec: any) => ({
        ...rec,
        priority: (['low', 'medium', 'high', 'critical'].includes(rec.priority) 
          ? rec.priority 
          : 'medium') as 'low' | 'medium' | 'high' | 'critical'
      }))
      setRecommendations(typedRecommendations)
      
      if (!data || data.length === 0) {
        console.log('No recommendations found in database')
      }
    } catch (error: any) {
      console.error('Error fetching recommendations:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch recommendations',
        variant: 'destructive'
      })
      setRecommendations([])
    } finally {
      setLoading(false)
    }
  }

  const generateRecommendations = async () => {
    if (!selectedBranch || !user) return

    setGenerating(true)
    try {
      // Use Edge Function instead of RPC for better AI-powered recommendations
      const { data, error } = await supabase.functions.invoke('ai-alert', {
        body: {
          branch_ids: [selectedBranch.id],
          recommendation_type: null
        }
      })

      if (error) {
        console.error('Error calling ai-alert function:', error)
        throw error
      }

      if (data && data.success) {
        toast({
          title: 'Success',
          description: `Generated ${data.count || 0} new recommendations`
        })

        await fetchRecommendations()
      } else {
        toast({
          title: 'Info',
          description: 'No new recommendations generated at this time. Your inventory is in good shape!'
        })
      }
    } catch (error: any) {
      console.error('Error generating recommendations:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate recommendations',
        variant: 'destructive'
      })
    } finally {
      setGenerating(false)
    }
  }

  const generateForecast = async () => {
    if (!selectedBranch || !user) return

    setLoadingForecast(true)
    try {
      const { data, error } = await supabase.functions.invoke('forecast', {
        body: {
          branch_id: selectedBranch.id,
          months_ahead: filterMonth === 'all' ? 6 : parseInt(filterMonth)
        }
      })

      if (error) {
        console.error('Error calling forecast function:', error)
        throw error
      }

      if (data && data.success) {
        setForecastData(data.forecast)
        setShowForecast(true)
        toast({
          title: 'Success',
          description: 'Forecast generated successfully'
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to generate forecast',
          variant: 'destructive'
        })
      }
    } catch (error: any) {
      console.error('Error generating forecast:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate forecast',
        variant: 'destructive'
      })
    } finally {
      setLoadingForecast(false)
    }
  }

  const updateRecommendationStatus = async (id: string, status: string) => {
    if (!user) return

    try {
      const { error } = await supabase.rpc('update_recommendation_status', {
        p_recommendation_id: id,
        p_status: status,
        p_user_id: user.id
      })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Recommendation status updated'
      })

      fetchRecommendations()
      setShowDetailsDialog(false)
    } catch (error: any) {
      console.error('Error updating recommendation status:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to update recommendation status',
        variant: 'destructive'
      })
    }
  }

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive'
      case 'high': return 'default'
      case 'medium': return 'secondary'
      case 'low': return 'outline'
      default: return 'outline'
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'implemented': return 'default'
      case 'reviewed': return 'secondary'
      case 'dismissed': return 'outline'
      case 'pending': return 'default'
      default: return 'outline'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'low_stock_alert': return <Package className="h-4 w-4" />
      case 'expiry_warning': return <AlertTriangle className="h-4 w-4" />
      case 'cost_reduction': return <DollarSign className="h-4 w-4" />
      case 'inventory_analysis': return <TrendingUp className="h-4 w-4" />
      default: return <Sparkles className="h-4 w-4" />
    }
  }

  const filteredRecommendations = recommendations.filter(rec => {
    if (filterStatus !== 'all' && rec.status !== filterStatus) return false
    if (filterPriority !== 'all' && rec.priority !== filterPriority) return false
    if (filterType !== 'all' && rec.recommendation_type !== filterType) return false
    if (filterMonth !== 'all') {
      // Filter by month based on created_at or forecast month in metadata
      const recDate = new Date(rec.created_at)
      const targetMonth = parseInt(filterMonth)
      const recMonth = recDate.getMonth() + 1 // getMonth() returns 0-11
      if (recMonth !== targetMonth) return false
    }
    return true
  })

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to view AI recommendations.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!canViewRecommendations) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to view AI recommendations.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 p-4">
      <Tabs defaultValue="recommendations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="chat">AI Chat Assistant</TabsTrigger>
        </TabsList>
        
        <TabsContent value="recommendations" className="space-y-6">
          <Card className="border-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold">
              <Sparkles className="h-6 w-6" />
              AI Recommendations
            </CardTitle>
            <CardDescription>
              AI-powered insights and recommendations for {selectedBranch.name} ({selectedBranch.code})
            </CardDescription>
          </div>
          <Button
            onClick={generateRecommendations}
            disabled={generating}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Recommendations'}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="low_stock_alert">Low Stock</SelectItem>
                  <SelectItem value="expiry_warning">Expiry Warning</SelectItem>
                  <SelectItem value="cost_reduction">Cost Reduction</SelectItem>
                  <SelectItem value="inventory_analysis">Inventory Analysis</SelectItem>
                  <SelectItem value="reorder_suggestion">Reorder Suggestion</SelectItem>
                  <SelectItem value="forecast">Forecast</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Month</label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  <SelectItem value="1">January</SelectItem>
                  <SelectItem value="2">February</SelectItem>
                  <SelectItem value="3">March</SelectItem>
                  <SelectItem value="4">April</SelectItem>
                  <SelectItem value="5">May</SelectItem>
                  <SelectItem value="6">June</SelectItem>
                  <SelectItem value="7">July</SelectItem>
                  <SelectItem value="8">August</SelectItem>
                  <SelectItem value="9">September</SelectItem>
                  <SelectItem value="10">October</SelectItem>
                  <SelectItem value="11">November</SelectItem>
                  <SelectItem value="12">December</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Forecast Button */}
          <div className="mb-6 flex justify-end gap-2">
            <Button
              onClick={generateForecast}
              disabled={loadingForecast}
              variant="outline"
              className="flex items-center gap-2"
            >
              <TrendingUp className={`h-4 w-4 ${loadingForecast ? 'animate-spin' : ''}`} />
              {loadingForecast ? 'Generating Forecast...' : 'Generate Forecast'}
            </Button>
          </div>

          {/* Forecast Display */}
          {showForecast && forecastData && (
            <Card className="mb-6 border-blue-200 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  Forecast Analysis
                </CardTitle>
                <CardDescription>
                  Predictive insights for the next {filterMonth === 'all' ? '6' : filterMonth} months
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {forecastData.expiry_forecast && (
                  <div>
                    <h4 className="font-semibold mb-2">Expiry Risk Forecast</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(forecastData.expiry_forecast).map(([month, data]: [string, any]) => (
                        <div key={month} className="p-3 bg-white rounded border">
                          <div className="font-medium">{month}</div>
                          <div className="text-sm text-muted-foreground">
                            {data.count} items expiring (Value: UGX {data.value?.toLocaleString() || 0})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {forecastData.demand_forecast && (
                  <div>
                    <h4 className="font-semibold mb-2">Demand Forecast</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(forecastData.demand_forecast).map(([month, data]: [string, any]) => (
                        <div key={month} className="p-3 bg-white rounded border">
                          <div className="font-medium">{month}</div>
                          <div className="text-sm text-muted-foreground">
                            Expected demand: {data.expected_demand} units
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {forecastData.reorder_points && forecastData.reorder_points.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Recommended Reorder Points</h4>
                    <div className="space-y-2">
                      {forecastData.reorder_points.slice(0, 5).map((item: any, idx: number) => (
                        <div key={idx} className="p-2 bg-white rounded border text-sm">
                          <span className="font-medium">{item.product_name}</span> - 
                          Reorder when stock reaches {item.reorder_point} units
                          (Current: {item.current_stock} units)
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForecast(false)}
                  className="w-full"
                >
                  Hide Forecast
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recommendations Table */}
          {loading ? (
            <div className="text-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading recommendations...</p>
            </div>
          ) : filteredRecommendations.length === 0 ? (
            <div className="text-center p-8 space-y-4">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <div>
                <p className="text-lg font-medium mb-2">No recommendations found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {recommendations.length === 0 
                    ? "You don't have any recommendations yet. Generate your first set of AI-powered insights!"
                    : "No recommendations match your current filters. Try adjusting your filters or generate new recommendations."}
                </p>
                <Button
                  onClick={generateRecommendations}
                  disabled={generating}
                  variant="default"
                  className="flex items-center gap-2 mx-auto"
                >
                  <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Generating...' : 'Generate Recommendations'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecommendations.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(rec.recommendation_type)}
                          <span className="text-sm capitalize">
                            {rec.recommendation_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{rec.title}</TableCell>
                      <TableCell>
                        <Badge variant={getPriorityBadgeVariant(rec.priority)}>
                          {rec.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(rec.status)}>
                          {rec.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{rec.impact_score}%</span>
                          {rec.estimated_savings && (
                            <span className="text-xs text-muted-foreground">
                              ${rec.estimated_savings.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(rec.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRecommendation(rec)
                              setShowDetailsDialog(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="chat">
          <AiChatInterface 
            recommendationContext={selectedRecommendation ? {
              id: selectedRecommendation.id,
              title: selectedRecommendation.title,
              recommendation: selectedRecommendation.recommendation,
              recommendation_type: selectedRecommendation.recommendation_type,
              priority: selectedRecommendation.priority,
              metadata: selectedRecommendation.metadata
            } : null}
          />
        </TabsContent>
      </Tabs>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRecommendation && getTypeIcon(selectedRecommendation.recommendation_type)}
              {selectedRecommendation?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedRecommendation && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={getPriorityBadgeVariant(selectedRecommendation.priority)}>
                    {selectedRecommendation.priority}
                  </Badge>
                  <Badge variant={getStatusBadgeVariant(selectedRecommendation.status)}>
                    {selectedRecommendation.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Impact: {selectedRecommendation.impact_score}%
                  </span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedRecommendation && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Recommendation</h4>
                <p className="text-sm whitespace-pre-line">{selectedRecommendation.recommendation}</p>
              </div>
              {selectedRecommendation.estimated_savings && (
                <div>
                  <h4 className="font-semibold mb-2">Estimated Savings</h4>
                  <p className="text-sm">${selectedRecommendation.estimated_savings.toFixed(2)}</p>
                </div>
              )}
              {selectedRecommendation.metadata && Object.keys(selectedRecommendation.metadata).length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Details</h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                    {JSON.stringify(selectedRecommendation.metadata, null, 2)}
                  </pre>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Created: {format(new Date(selectedRecommendation.created_at), 'PPpp')}
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {selectedRecommendation?.status === 'pending' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => updateRecommendationStatus(selectedRecommendation.id, 'dismissed')}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Dismiss
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateRecommendationStatus(selectedRecommendation.id, 'reviewed')}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark as Reviewed
                  </Button>
                </>
              )}
              {selectedRecommendation?.status === 'reviewed' && (
                <Button
                  onClick={() => updateRecommendationStatus(selectedRecommendation.id, 'implemented')}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark as Implemented
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AiRecommendationsManager

