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

  const canViewRecommendations = hasAdminAccess || isSystemAdmin || isRegionalManager

  useEffect(() => {
    if (selectedBranch && canViewRecommendations) {
      fetchRecommendations()
    }
  }, [selectedBranch, canViewRecommendations, filterStatus, filterPriority, filterType])

  const fetchRecommendations = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
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

      if (error) throw error
      setRecommendations(data || [])
    } catch (error: any) {
      console.error('Error fetching recommendations:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch recommendations',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const generateRecommendations = async () => {
    if (!selectedBranch || !user) return

    setGenerating(true)
    try {
      // Call the generate function
      const { data, error } = await supabase.rpc('generate_ai_recommendations', {
        p_branch_id: selectedBranch.id,
        p_recommendation_type: null
      })

      if (error) {
        console.error('Error calling generate_ai_recommendations:', error)
        throw error
      }

      // Insert recommendations into database
      if (data && data.length > 0) {
        const recommendationsToInsert = data.map((rec: any) => ({
          branch_id: rec.branch_id || selectedBranch.id,
          recommendation_type: rec.recommendation_type,
          title: rec.title,
          recommendation: rec.recommendation,
          priority: rec.priority || 'medium',
          status: 'pending',
          metadata: rec.metadata || {},
          impact_score: rec.impact_score || 0,
          estimated_savings: rec.metadata?.expiring_value || rec.metadata?.potential_loss || null,
          related_stock_items: rec.metadata?.stock_item_ids || null
        }))

        const { error: insertError } = await supabase
          .from('ai_recommendations')
          .insert(recommendationsToInsert)

        if (insertError) {
          console.error('Error inserting recommendations:', insertError)
          throw insertError
        }

        toast({
          title: 'Success',
          description: `Generated ${recommendationsToInsert.length} new recommendations`
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
    <div className="space-y-6">
      <Card>
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
          <div className="grid grid-cols-3 gap-4 mb-6">
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
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recommendations Table */}
          {loading ? (
            <div className="text-center p-8">Loading...</div>
          ) : filteredRecommendations.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              No recommendations found. Click "Generate Recommendations" to create new ones.
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

