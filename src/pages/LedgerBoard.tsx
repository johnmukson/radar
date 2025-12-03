import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Shield, Search, Filter, Download, ArrowUpDown, Calendar, Package, Building, User, Trophy, Target, TrendingUp, Award, Clock, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface StockMovement {
  id: string
  movement_date: string
  movement_type: string
  from_branch: string | null
  to_branch: string | null
  quantity_moved: number
  moved_by: string | null
  notes: string | null
  for_dispenser?: string | null
  product_name: string | null
}

interface DispenserPerformance {
  dispenser_id: string
  dispenser_name: string
  branch_name: string
  total_tasks: number
  completed_tasks: number
  pending_tasks: number
  total_adjustments: number
  total_quantity_adjusted: number
  total_completions: number
  completion_rate: number
  efficiency_score: number
  last_activity: string
  streak_days: number
  rank: number
}

const LedgerBoard = () => {
  const { user } = useAuth()
  const { selectedBranch, isSystemAdmin, isRegionalManager, availableBranches } = useBranch()
  const [userAssignedBranch, setUserAssignedBranch] = useState<{ id: string; name: string } | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterBranch, setFilterBranch] = useState<string>('all')
  const { toast } = useToast()
  
  // Determine which branch to use: user's assigned branch (for non-admins) or selectedBranch (for admins)
  const activeBranch = isSystemAdmin || isRegionalManager 
    ? selectedBranch 
    : (userAssignedBranch ? { id: userAssignedBranch.id, name: userAssignedBranch.name } : selectedBranch)

  // Performance tracking states
  const [dispenserPerformance, setDispenserPerformance] = useState<DispenserPerformance[]>([])
  const [performanceLoading, setPerformanceLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('week') // week, month, quarter

  // Load user's assigned branch from their role
  useEffect(() => {
    const loadUserBranch = async () => {
      if (!user || isSystemAdmin || isRegionalManager) {
        // System admins and regional managers use selectedBranch
        setUserAssignedBranch(null)
        return
      }

      try {
        // Get user's assigned branch from user_roles
        const { data: userRoles, error } = await supabase
          .from('user_roles')
          .select(`
            branch_id,
            branch:branches!inner(id, name, code, status)
          `)
          .eq('user_id', user.id)
          .not('branch_id', 'is', null)
          .eq('branch.status', 'active')
          .limit(1) // Get first assigned branch

        if (error) throw error

        if (userRoles && userRoles.length > 0) {
          const branch = userRoles[0].branch
          setUserAssignedBranch({
            id: branch.id,
            name: branch.name
          })
        } else {
          // No assigned branch found
          setUserAssignedBranch(null)
        }
      } catch (error) {
        console.error('Error loading user branch:', error)
        setUserAssignedBranch(null)
      }
    }

    loadUserBranch()
  }, [user, isSystemAdmin, isRegionalManager])

  const loadMovements = useCallback(async () => {
    try {
      let query = supabase
        .from('stock_movement_history')
        .select(`
          *,
          stock_items!inner(product_name, branch_id),
          from_branch:branches!stock_movement_history_from_branch_id_fkey(name),
          to_branch:branches!stock_movement_history_to_branch_id_fkey(name),
          moved_by_user:users!stock_movement_history_moved_by_fkey(name)
        `)

      // Filter by active branch (user's assigned branch or selected branch)
      if (activeBranch) {
        // Filter movements where the movement is from or to the active branch
        query = query.or(`from_branch_id.eq.${activeBranch.id},to_branch_id.eq.${activeBranch.id}`)
      }

      const { data, error } = await query
        .order('movement_date', { ascending: false })
      
      if (error) throw error
      
      // Transform the data to match the expected interface
      let transformedData = data?.map(movement => ({
        id: movement.id,
        movement_date: movement.movement_date,
        movement_type: movement.movement_type,
        from_branch: movement.from_branch?.name || 'Unknown Branch',
        to_branch: movement.to_branch?.name || 'Unknown Branch',
        quantity_moved: movement.quantity_moved,
        moved_by: movement.moved_by_user?.name || 'Unknown User',
        notes: movement.notes,
        for_dispenser: movement.for_dispenser,
        product_name: movement.stock_items?.product_name || 'Unknown Product',
        stock_item_branch_id: movement.stock_items?.branch_id || null
      })) || []
      
      // Additional filtering: if activeBranch, filter by stock_item's branch_id
      if (activeBranch) {
        transformedData = transformedData.filter(movement => 
          movement.stock_item_branch_id === activeBranch.id
        )
      }
      
      // Remove the temporary branch_id field
      transformedData = transformedData.map(({ stock_item_branch_id, ...rest }) => rest)
      
      setMovements(transformedData)
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to load stock movements"
      
      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message
        } else if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error
        } else if ('details' in error && typeof error.details === 'string') {
          errorMessage = error.details
        } else if ('hint' in error && typeof error.hint === 'string') {
          errorMessage = error.hint
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      console.error('Error loading movements:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast, activeBranch])

  const loadDispenserPerformance = useCallback(async () => {
    setPerformanceLoading(true)
    try {
      // Get date range based on selected period
      const now = new Date()
      const startDate = new Date()
      switch (selectedPeriod) {
        case 'week':
          startDate.setDate(now.getDate() - 7)
          break
        case 'month':
          startDate.setMonth(now.getMonth() - 1)
          break
        case 'quarter':
          startDate.setMonth(now.getMonth() - 3)
          break
        default:
          startDate.setDate(now.getDate() - 7)
      }

      // Get all dispensers - try direct query first, then fallback to view
      let dispensers = null
      let dispensersError = null
      
      // First try direct query from users and user_roles tables
      let directQuery = supabase
        .from('users')
        .select(`
          id,
          name,
          user_roles!inner(role, branch_id),
          branches!user_roles(branch_id, name)
        `)
        .eq('user_roles.role', 'dispenser')
      
      // Filter by active branch (user's assigned branch or selected branch)
      if (activeBranch) {
        directQuery = directQuery.eq('user_roles.branch_id', activeBranch.id)
      }
      
      const { data: directDispensers, error: directError } = await directQuery
      
      if (directError) {
        console.error('Direct query failed, trying view:', directError)
        // Fallback to view
        let viewQuery = supabase
          .from('users_with_roles')
          .select('user_id, name, branch_name')
          .eq('role', 'dispenser')
        
        // Filter by active branch (user's assigned branch or selected branch)
        if (activeBranch) {
          viewQuery = viewQuery.eq('branch_id', activeBranch.id)
        }
        
        const { data: viewDispensers, error: viewError } = await viewQuery
        
        dispensers = viewDispensers
        dispensersError = viewError
      } else {
        // Transform direct query results to match expected format
        dispensers = directDispensers?.map(user => ({
          user_id: user.id,
          name: user.name,
          branch_name: (user.branches as any)?.name || 'Unknown Branch'
        })) || []
        dispensersError = null
      }

      if (dispensersError) throw dispensersError
      
      // Debug: Log the dispensers data to see what we're getting
      console.log('Dispensers fetched:', dispensers)
      console.log('Dispenser user_id types:', dispensers?.map(d => ({ name: d.name, user_id: d.user_id, type: typeof d.user_id })))

      const performanceData: DispenserPerformance[] = []

      for (const dispenser of dispensers || []) {
        console.log('Processing dispenser:', dispenser.name, 'ID:', dispenser.user_id)
        
        // Validate that user_id is a valid UUID
        if (!dispenser.user_id || typeof dispenser.user_id !== 'string' || !dispenser.user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          console.error(`Invalid user_id for dispenser ${dispenser.name}:`, dispenser.user_id)
          continue // Skip this dispenser
        }
        
        // Get tasks for this dispenser
        const { data: tasks, error: tasksError } = await supabase
          .from('weekly_tasks')
          .select('*')
          .eq('assigned_to', dispenser.user_id)
          .gte('created_at', startDate.toISOString())

        if (tasksError) throw tasksError

        // Get all stock movements made by this dispenser
        // First try by user ID, then by user name as fallback
        let adjustments = null
        let adjustmentsError = null
        
        // Try to get movements by user ID first
        const { data: adjustmentsById, error: errorById } = await supabase
          .from('stock_movement_history')
          .select('*')
          .in('movement_type', [
            'adjustment', 'completion', 'dispense', 'stock_in', 'stock_out', 
            'stock_adjustment', 'removal', 'deletion', 'emergency_declared', 
            'emergency_assigned', 'bulk_deletion'
          ])
          .eq('moved_by', dispenser.user_id)
          .gte('movement_date', startDate.toISOString())
        
        if (errorById) {
          console.error(`Error fetching movements by ID for ${dispenser.name}:`, errorById)
        }
        
        // If no movements found by ID, try to find movements by looking up the user ID from name
        if (!adjustmentsById || adjustmentsById.length === 0) {
          // First, try to find the user ID by name
          const { data: userByName, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('name', dispenser.name)
            .single()
          
          if (userError) {
            console.error(`Error finding user by name ${dispenser.name}:`, userError)
            adjustments = []
            adjustmentsError = null
          } else if (userByName) {
            // Now get movements by the found user ID
            const { data: adjustmentsByName, error: errorByName } = await supabase
              .from('stock_movement_history')
              .select('*')
              .in('movement_type', [
                'adjustment', 'completion', 'dispense', 'stock_in', 'stock_out', 
                'stock_adjustment', 'removal', 'deletion', 'emergency_declared', 
                'emergency_assigned', 'bulk_deletion'
              ])
              .eq('moved_by', userByName.id)
              .gte('movement_date', startDate.toISOString())
            
            if (errorByName) {
              console.error(`Error fetching movements by found user ID for ${dispenser.name}:`, errorByName)
            }
            
            adjustments = adjustmentsByName
            adjustmentsError = errorByName
          } else {
            adjustments = []
            adjustmentsError = null
          }
        } else {
          adjustments = adjustmentsById
          adjustmentsError = errorById
        }
        
        console.log(`Found ${adjustments?.length || 0} movements for ${dispenser.name}`)

        if (adjustmentsError) {
          console.error(`Error fetching movements for ${dispenser.name}:`, adjustmentsError)
          throw adjustmentsError
        }

        // Debug: Let's also check all movements to see what user IDs exist
        if (dispenser.name === 'MUKWAYA JOHNSON') {
          const { data: allMovements } = await supabase
            .from('stock_movement_history')
            .select('moved_by, movement_type, notes, movement_date')
            .gte('movement_date', startDate.toISOString())
            .order('movement_date', { ascending: false })
            .limit(10)
          console.log('Recent movements in database:', allMovements)
          console.log('Johnson user ID:', dispenser.user_id)
          console.log('Movements by ID:', adjustmentsById)
          console.log('Movements by name:', adjustments)
        }

        const totalTasks = tasks?.length || 0
        const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0
        const pendingTasks = tasks?.filter(t => t.status === 'pending').length || 0
        const totalMovements = adjustments?.length || 0
        const totalQuantityMoved = adjustments?.reduce((sum, adj) => sum + Math.abs(adj.quantity_moved), 0) || 0
        
        // Special scoring for completions (fully completed products)
        const completions = adjustments?.filter(adj => adj.movement_type === 'completion') || []
        const totalCompletions = completions.length
        const completionBonus = totalCompletions * 10 // Extra credit for each completed product
        
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
        // Enhanced scoring that values small quantities and movements equally
        const taskScore = completionRate * 0.3 // Reduced weight for tasks
        const movementScore = totalMovements * 4 // Increased weight for number of movements
        const quantityScore = totalQuantityMoved * 1.5 // Increased weight for total quantity moved
        
        // Bonus for small quantity movements (encourages frequent small movements)
        const smallMovements = adjustments?.filter(adj => Math.abs(adj.quantity_moved) <= 5).length || 0
        const smallMovementBonus = smallMovements * 2 // Bonus for small movements
        
        // Bonus for activity frequency (more movements = better)
        const activityBonus = totalMovements >= 10 ? 20 : totalMovements >= 5 ? 10 : 0
        
        const efficiencyScore = Math.round(taskScore + movementScore + quantityScore + smallMovementBonus + activityBonus + completionBonus)

        // Calculate streak (consecutive days with activity)
        const activityDates = new Set()
        if (tasks) {
          tasks.forEach(task => {
            if (task.status === 'completed') {
              activityDates.add(new Date(task.updated_at).toDateString())
            }
          })
        }
        if (adjustments) {
          adjustments.forEach(adj => {
            activityDates.add(new Date(adj.movement_date).toDateString())
          })
        }

        const sortedDates = Array.from(activityDates).sort().reverse()
        let streakDays = 0
        const currentDate = new Date()
        for (let i = 0; i < sortedDates.length; i++) {
          const activityDate = new Date(sortedDates[i] as string)
          const diffDays = Math.floor((currentDate.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays === i) {
            streakDays++
          } else {
            break
          }
        }

        // Get last activity
        const allActivities = [
          ...(tasks?.map(t => ({ date: t.updated_at, type: 'task' })) || []),
          ...(adjustments?.map(a => ({ date: a.movement_date, type: 'adjustment' })) || [])
        ]
        const lastActivity = allActivities.length > 0 
          ? allActivities.sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())[0].date
          : 'No activity'

        performanceData.push({
          dispenser_id: dispenser.user_id,
          dispenser_name: dispenser.name,
          branch_name: dispenser.branch_name || 'Unknown',
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          pending_tasks: pendingTasks,
          total_adjustments: totalMovements,
          total_quantity_adjusted: totalQuantityMoved,
          total_completions: totalCompletions,
          completion_rate: completionRate,
          efficiency_score: efficiencyScore,
          last_activity: lastActivity,
          streak_days: streakDays,
          rank: 0 // Will be set after sorting
        })
      }

      // Sort by efficiency score and assign ranks
      performanceData.sort((a, b) => b.efficiency_score - a.efficiency_score)
      performanceData.forEach((perf, index) => {
        perf.rank = index + 1
      })

      setDispenserPerformance(performanceData)
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to load dispenser performance data"
      
      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message
        } else if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error
        } else if ('details' in error && typeof error.details === 'string') {
          errorMessage = error.details
        } else if ('hint' in error && typeof error.hint === 'string') {
          errorMessage = error.hint
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      console.error('Error loading performance data:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setPerformanceLoading(false)
    }
  }, [selectedPeriod, toast, activeBranch])

  useEffect(() => {
    if (user) {
      loadMovements()
      loadDispenserPerformance()
    }
  }, [user, loadMovements, loadDispenserPerformance])

  const filteredMovements = movements.filter(movement => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === '' || 
      (movement.product_name && movement.product_name.toLowerCase().includes(searchLower)) ||
      (movement.moved_by && movement.moved_by.toLowerCase().includes(searchLower)) ||
      (movement.notes && movement.notes.toLowerCase().includes(searchLower));
    
    const matchesType = filterType === 'all' || movement.movement_type === filterType
    const matchesBranch = filterBranch === 'all' || 
      movement.from_branch === filterBranch || 
      movement.to_branch === filterBranch

    return matchesSearch && matchesType && matchesBranch
  })

  const getMovementTypeColor = (type: string) => {
    switch (type) {
      case 'sale': return 'bg-green-100 text-green-800'
      case 'transfer': return 'bg-blue-100 text-blue-800'
      case 'adjustment': return 'bg-yellow-100 text-yellow-800'
      case 'completion': return 'bg-emerald-100 text-emerald-800'
      case 'expiry': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading ledger data...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Please log in to access the ledger.</p>
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
            <h1 className="text-2xl font-bold">Ledger Board</h1>
            <p className="text-muted-foreground">
              Track all stock movements and dispenser performance
              {activeBranch && (
                <span className="ml-2 text-primary font-semibold">
                  • {activeBranch.name}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Package className="h-4 w-4" />
              <span>{filteredMovements.length} Movements</span>
            </div>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="ledger" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ledger" className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />
              Stock Movements
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Dispenser Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="space-y-6">
            {/* Filters */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search movements..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Movement Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="sale">Sales</SelectItem>
                      <SelectItem value="transfer">Transfers</SelectItem>
                      <SelectItem value="adjustment">Adjustments</SelectItem>
                      <SelectItem value="expiry">Expiries</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterBranch} onValueChange={setFilterBranch}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      <SelectItem value="main">Main Branch</SelectItem>
                      <SelectItem value="branch1">Branch 1</SelectItem>
                      <SelectItem value="branch2">Branch 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Movements Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpDown className="h-5 w-5" />
                  Stock Movements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Moved By</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No movements found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMovements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(movement.movement_date), 'MMM dd, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              {movement.product_name || 'Unknown Product'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getMovementTypeColor(movement.movement_type)}>
                              {movement.movement_type.charAt(0).toUpperCase() + movement.movement_type.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4 text-muted-foreground" />
                              {movement.from_branch || 'Unknown Branch'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4 text-muted-foreground" />
                              {movement.to_branch || 'Unknown Branch'}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {movement.quantity_moved}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              {movement.moved_by || 'Unknown Mover'}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {movement.notes || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            {/* Performance Header */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Dispenser Performance Leaderboard</h2>
                <p className="text-muted-foreground">Track and incentivize dispenser productivity</p>
              </div>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {performanceLoading ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-muted-foreground">Loading performance data...</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Top Performers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {dispenserPerformance.slice(0, 3).map((perf, index) => (
                    <Card key={perf.dispenser_id} className="relative overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                            {index === 1 && <Award className="h-5 w-5 text-gray-400" />}
                            {index === 2 && <Award className="h-5 w-5 text-orange-500" />}
                            <Badge variant="outline">#{perf.rank}</Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-primary">{perf.efficiency_score}</div>
                            <div className="text-xs text-muted-foreground">Efficiency Score</div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="font-semibold">{perf.dispenser_name}</div>
                          <div className="text-sm text-muted-foreground">{perf.branch_name}</div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>{perf.completed_tasks} completed</span>
                          </div>
                                                     <div className="flex items-center gap-2 text-sm">
                             <Target className="h-4 w-4 text-blue-500" />
                             <span>{perf.total_adjustments} movements ({perf.total_quantity_adjusted} units)</span>
                           </div>
                          <div className="flex items-center gap-2 text-sm">
                            <TrendingUp className="h-4 w-4 text-purple-500" />
                            <span>{perf.streak_days} day streak</span>
                          </div>
                          <Progress value={perf.completion_rate} className="h-2" />
                          <div className="text-xs text-muted-foreground">
                            {perf.completion_rate.toFixed(1)}% completion rate
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Full Performance Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Complete Performance Rankings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Dispenser</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Tasks</TableHead>
                          <TableHead>Movements</TableHead>
                          <TableHead>Completions</TableHead>
                          <TableHead>Quantity Moved</TableHead>
                          <TableHead>Completion Rate</TableHead>
                          <TableHead>Efficiency Score</TableHead>
                          <TableHead>Streak</TableHead>
                          <TableHead>Last Activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dispenserPerformance.map((perf) => (
                          <TableRow key={perf.dispenser_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {perf.rank <= 3 && (
                                  <Trophy className={`h-4 w-4 ${
                                    perf.rank === 1 ? 'text-yellow-500' : 
                                    perf.rank === 2 ? 'text-gray-400' : 'text-orange-500'
                                  }`} />
                                )}
                                <Badge variant={perf.rank <= 3 ? 'default' : 'secondary'}>
                                  #{perf.rank}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{perf.dispenser_name}</TableCell>
                            <TableCell>{perf.branch_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span>{perf.completed_tasks}/{perf.total_tasks}</span>
                              </div>
                            </TableCell>
                                                         <TableCell>
                               <div className="flex items-center gap-2">
                                 <Target className="h-4 w-4 text-blue-500" />
                                 <span>{perf.total_adjustments} movements</span>
                               </div>
                             </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                                <span className="font-medium text-emerald-600">{perf.total_completions} completed</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-green-500" />
                                <span className="font-medium">{perf.total_quantity_adjusted} units</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={perf.completion_rate} className="w-16 h-2" />
                                <span className="text-sm">{perf.completion_rate.toFixed(1)}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold text-primary">{perf.efficiency_score}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-purple-500" />
                                <span>{perf.streak_days} days</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">
                                  {perf.last_activity === 'No activity' 
                                    ? 'No activity' 
                                    : format(new Date(perf.last_activity as string), 'MMM dd')
                                  }
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default LedgerBoard
