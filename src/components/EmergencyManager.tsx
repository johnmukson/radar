import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { format } from 'date-fns'
import { AlertTriangle, Clock, Users, Package, MessageCircle, Scale, BarChart3, Eye, Calendar, Building2, DollarSign, AlertCircle } from 'lucide-react'
import { isExpired } from '@/utils/expiryUtils'

interface StockItem {
  id: string
  product_name: string
  branch: string
  quantity: number
  unit_price: number
  is_emergency: boolean
  emergency_declared_at: string | null
  expiry_date: string
  risk_level?: string
}

interface Dispenser {
  id: string
  name: string
  branch: string
  status: string
  whatsapp_number: string | null
}

interface EmergencyAssignment {
  id: string
  stock_item_id: string
  dispenser_id: string
  assigned_quantity: number
  deadline: string
  status: string
  assigned_at: string
  notes?: string | null
  stock_item?: {
    id: string
    product_name: string
    branch: string
  }
  dispenser?: {
    id: string
    name: string
    branch: string
    whatsapp_number: string | null
  }
}

interface DispenserWorkload {
  dispenser_id: string
  name: string
  branch: string
  total_assignments: number
  critical_assignments: number
  high_assignments: number
  medium_assignments: number
  low_assignments: number
  expired_assignments: number
  total_quantity: number
  workload_score: number
}

const EXPAND_DEFAULT = 5;
function getExpiryCategory(daysLeft: number) {
  if (daysLeft <= 60) return 'within60';
  if (daysLeft <= 120) return '61to120';
  if (daysLeft <= 180) return '121to180';
  if (daysLeft <= 365) return '181to365';
  return 'above365';
}
function isInCurrentMonth(dateStr: string) {
  const today = new Date();
  const date = new Date(dateStr);
  return today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth();
}
const groupLabels = {
  within60: 'Expiring within 60 days',
  '61to120': 'Expiring in 61–120 days',
  '121to180': 'Expiring in 121–180 days',
  '181to365': 'Expiring in 181 days–1 year',
  above365: 'Expiring above 1 year',
};


const EmergencyManager = () => {
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [emergencyAssignments, setEmergencyAssignments] = useState<EmergencyAssignment[]>([])
  const [dispenserWorkloads, setDispenserWorkloads] = useState<DispenserWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [showFairAssignDialog, setShowFairAssignDialog] = useState(false)
  const [showWorkloadDialog, setShowWorkloadDialog] = useState(false)
  const [deadline, setDeadline] = useState('')
  const [dispenserAssignments, setDispenserAssignments] = useState<{ [key: string]: number }>({})
  const [fairAssignments, setFairAssignments] = useState<{ [key: string]: { [key: string]: number } }>({})
  const [notes, setNotes] = useState('')
  const { toast } = useToast()

  const [selectedItemForDetails, setSelectedItemForDetails] = useState<StockItem | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<{[key:string]:boolean}>({});
  const grouped = {
    within60: [],
    '61to120': [],
    '121to180': [],
    '181to365': [],
    above365: []
  };

  // Memoize filtered dispensers to prevent unnecessary recalculations
  const filteredDispensers = useMemo(() => {
    if (!selectedItem || !selectedItem.branch) return [];
    
    return dispensers.filter(d =>
      d.branch && selectedItem.branch &&
      d.branch.trim().toLowerCase() === selectedItem.branch.trim().toLowerCase()
    );
  }, [dispensers, selectedItem]);

  const fetchData = useCallback(async () => {
    try {
      const [stockResponse, dispensersResponse, assignmentsResponse] = await Promise.all([
              supabase.from('stock_items').select('*').order('created_at', { ascending: false }),
      supabase.from('users_with_roles').select('user_id, name, phone').eq('role', 'dispenser'),
        supabase.from('emergency_assignments').select(`
          *,
          stock_item:stock_items(id, product_name, branch_id),
          dispenser:users!dispenser_id(id, name, phone)
        `).order('assigned_at', { ascending: false })
      ])

      if (stockResponse.error) throw stockResponse.error
      if (dispensersResponse.error) throw dispensersResponse.error
      if (assignmentsResponse.error) throw assignmentsResponse.error

      // Calculate risk levels for stock items
      const itemsWithRisk = (stockResponse.data || []).map(item => {
        const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        let risk_level = 'low'
        
        if (daysToExpiry < 0) risk_level = 'expired'
        else if (daysToExpiry <= 7) risk_level = 'critical'
        else if (daysToExpiry <= 30) risk_level = 'high'
        else if (daysToExpiry <= 90) risk_level = 'medium'
        
        return { ...item, risk_level }
      })

      // IMMUTABLE LAW: Exclude expired items from emergency assignments
      // Expired items should only be managed in Expiry Manager
      const nonExpiredItems = itemsWithRisk.filter(item => !isExpired(item.expiry_date))

      setStockItems(nonExpiredItems)
      const mappedDispensers = (dispensersResponse.data || []).map(d => ({
        id: d.user_id,
        name: d.name,
        phone: d.phone,
        status: 'active',
        whatsapp_number: d.whatsapp_number || d.phone || null
      }))
      setDispensers(mappedDispensers)
      setEmergencyAssignments(assignmentsResponse.data || [])

      // Calculate workloads
      await calculateDispenserWorkloads(mappedDispensers, assignmentsResponse.data || [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to fetch data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const calculateDispenserWorkloads = async (dispensers: Dispenser[], assignments: EmergencyAssignment[]) => {
    const workloads: DispenserWorkload[] = dispensers.map(dispenser => {
      const dispenserAssignments = assignments.filter(a => a.dispenser_id === dispenser.id)
      
      // Count assignments by risk level based on historical data
      const riskCounts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        expired: 0
      }

      let totalQuantity = 0

      for (const assignment of dispenserAssignments) {
        totalQuantity += assignment.assigned_quantity
        
        // We need to determine the risk level at the time of assignment
        // For now, we'll use a weighted approach based on deadline urgency
        const daysTillDeadline = Math.ceil((new Date(assignment.deadline).getTime() - new Date(assignment.assigned_at).getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysTillDeadline <= 1) riskCounts.critical++
        else if (daysTillDeadline <= 3) riskCounts.high++
        else if (daysTillDeadline <= 7) riskCounts.medium++
        else riskCounts.low++
      }

      // Calculate workload score (higher = more burdened)
      // Critical assignments get highest weight, then high, medium, low
      const workloadScore = (
        riskCounts.critical * 10 +
        riskCounts.high * 5 +
        riskCounts.medium * 3 +
        riskCounts.low * 1 +
        riskCounts.expired * 15 // Expired items are most critical
      ) + (totalQuantity * 0.1) // Small weight for quantity

      return {
        dispenser_id: dispenser.id,
        name: dispenser.name,
        branch: dispenser.branch,
        total_assignments: dispenserAssignments.length,
        critical_assignments: riskCounts.critical,
        high_assignments: riskCounts.high,
        medium_assignments: riskCounts.medium,
        low_assignments: riskCounts.low,
        expired_assignments: riskCounts.expired,
        total_quantity: totalQuantity,
        workload_score: workloadScore
      }
    })

    // Sort by workload score to identify most/least burdened
    workloads.sort((a, b) => a.workload_score - b.workload_score)
    setDispenserWorkloads(workloads)
  }

  const calculateEquitableFairDistribution = () => {
    const emergencyItems = stockItems.filter(item => item.is_emergency)
    
    // Group items by risk level
    const itemsByRisk = {
      expired: emergencyItems.filter(item => item.risk_level === 'expired'),
      critical: emergencyItems.filter(item => item.risk_level === 'critical'),
      high: emergencyItems.filter(item => item.risk_level === 'high'),
      medium: emergencyItems.filter(item => item.risk_level === 'medium'),
      low: emergencyItems.filter(item => item.risk_level === 'low')
    }

    const assignments: { [key: string]: { [key: string]: number } } = {}
    
    // Initialize assignments for each dispenser
    dispensers.forEach(dispenser => {
      assignments[dispenser.id] = {}
      Object.keys(itemsByRisk).forEach(riskLevel => {
        assignments[dispenser.id][riskLevel] = 0
      })
    })

    // Sort dispensers by current workload (least burdened first)
    const sortedDispensers = [...dispensers].sort((a, b) => {
      const workloadA = dispenserWorkloads.find(w => w.dispenser_id === a.id)?.workload_score || 0
      const workloadB = dispenserWorkloads.find(w => w.dispenser_id === b.id)?.workload_score || 0
      return workloadA - workloadB
    })

    // Distribute items fairly by risk category, prioritizing least burdened dispensers
    Object.entries(itemsByRisk).forEach(([riskLevel, items]) => {
      if (items.length === 0) return
      
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
      const baseQuantityPerDispenser = Math.floor(totalQuantity / sortedDispensers.length)
      const remainder = totalQuantity % sortedDispensers.length
      
      // Give extra items to least burdened dispensers first
      sortedDispensers.forEach((dispenser, index) => {
        let assignedQuantity = baseQuantityPerDispenser
        // Distribute remainder to least burdened dispensers
        if (index < remainder) {
          assignedQuantity += 1
        }
        assignments[dispenser.id][riskLevel] = assignedQuantity
      })
    })

    setFairAssignments(assignments)
    setShowFairAssignDialog(true)
  }

  const sendWhatsAppNotification = async (assignment: EmergencyAssignment, dispenser: Dispenser) => {
    if (!dispenser.whatsapp_number) return

    const message = `🚨 EMERGENCY STOCK ASSIGNMENT 🚨

📦 Product: ${assignment.stock_item?.product_name}
🏢 From Branch: ${assignment.stock_item?.branch}
📊 Quantity Assigned: ${assignment.assigned_quantity} units
⏰ Deadline: ${format(new Date(assignment.deadline), 'MMM dd, yyyy HH:mm')}

⚡ This is an URGENT assignment. Please prioritize this task and complete it by the deadline.

${assignment.notes ? `📝 Additional Notes: ${assignment.notes}` : ''}

Contact your supervisor immediately if you cannot complete this assignment on time.`

    try {
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          to: dispenser.whatsapp_number,
          message,
          messageType: 'emergency_assignment',
          relatedId: assignment.id
        }
      })

      if (error) throw error
      
      // console.log('WhatsApp notification sent successfully to', dispenser.whatsapp_number)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error sending WhatsApp notification:', message)
      toast({
        title: "WhatsApp Error",
        description: `Assignment created but WhatsApp notification to ${dispenser.name} failed`,
        variant: "destructive",
      })
    }
  }

  const declareEmergency = async (item: StockItem) => {
    try {
      const { error } = await supabase
        .from('stock_items')
        .update({
          is_emergency: true,
          emergency_declared_at: new Date().toISOString()
        })
        .eq('id', item.id)

      if (error) throw error

      // Record movement in history
      await supabase.from('stock_movement_history').insert({
        stock_item_id: item.id,
        movement_type: 'emergency_declared',
        quantity_moved: 0,
        from_branch_id: null,
        notes: `Emergency declared for ${item.product_name}`,
        moved_by: null
      })

      setSelectedItem({ ...item, is_emergency: true })
      setShowAssignDialog(true)
      fetchData()

      toast({
        title: "Emergency Declared",
        description: `${item.product_name} has been marked as emergency`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to declare emergency",
        variant: "destructive",
      })
    }
  }

  const assignToDispensers = async () => {
    if (!selectedItem || Object.keys(dispenserAssignments).length === 0) {
      toast({
        title: "Error",
        description: "Please select an item and assign quantities to dispensers",
        variant: "destructive",
      })
      return
    }

    // IMMUTABLE LAW: Prevent expired items from being assigned
    if (isExpired(selectedItem.expiry_date)) {
      toast({
        title: "Cannot Assign Expired Item",
        description: "Expired items should only be managed in Expiry Manager, not assigned to dispensers",
        variant: "destructive",
      })
      return
    }

    const assignments = Object.entries(dispenserAssignments)
      .filter(([_, quantity]) => quantity > 0)
      .map(([dispenserId, quantity]) => ({
        stock_item_id: selectedItem.id,
        dispenser_id: dispenserId,
        assigned_quantity: quantity,
        deadline: deadline,
        notes: notes,
        status: 'pending',
        assigned_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))

    if (assignments.length === 0) {
      toast({
        title: "Error",
        description: "No assignments to create",
        variant: "destructive",
      })
      return
    }

    try {
      // Get current user for assignment tracking
      const { data: { user } } = await supabase.auth.getUser()
      
      const assignmentsWithUser = assignments.map(assignment => ({
        ...assignment,
        assigned_by: user?.id
      }))

      const { data: createdAssignments, error } = await supabase
        .from('emergency_assignments')
        .insert(assignmentsWithUser)
        .select(`
          *,
          stock_item:stock_items(id, product_name, branch_id),
          dispenser:users!dispenser_id(id, name, phone)
        `)

      if (error) throw error

      // Send WhatsApp notifications and record movement history
      for (const assignment of createdAssignments) {
        const dispenser = dispensers.find(d => d.id === assignment.dispenser_id)
        
        if (dispenser) {
          // Send WhatsApp notification
          await sendWhatsAppNotification(assignment, dispenser)
          
          // Record movement in history
          await supabase.from('stock_movement_history').insert({
            stock_item_id: selectedItem.id,
            movement_type: 'emergency_assigned',
            quantity_moved: assignment.assigned_quantity,
            from_branch_id: null,
            to_branch_id: null,
            for_dispenser: assignment.dispenser_id,
            notes: `Emergency assignment: ${assignment.assigned_quantity} units assigned to ${dispenser.name}`,
            moved_by: null
          })
        }
      }

      setShowAssignDialog(false)
      setSelectedItem(null)
      setDeadline('')
      setDispenserAssignments({})
      setNotes('')
      fetchData()

      toast({
        title: "Success",
        description: `Emergency assignments created for ${assignments.length} dispensers with WhatsApp notifications`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to create emergency assignments",
        variant: "destructive",
      })
    }
  }

  const createEquitableFairAssignments = async () => {
    if (!deadline) {
      toast({
        title: "Error",
        description: "Please select a deadline",
        variant: "destructive",
      })
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const emergencyItems = stockItems.filter(item => item.is_emergency)
      
      // IMMUTABLE LAW: Exclude expired items from assignments
      const nonExpiredEmergencyItems = emergencyItems.filter(item => !isExpired(item.expiry_date))
      
      if (nonExpiredEmergencyItems.length === 0) {
        toast({
          title: "No Valid Items",
          description: "All emergency items are expired and should be managed in Expiry Manager",
          variant: "destructive",
        })
        return
      }
      
      // Group items by risk level (in priority order) - excluding expired
      const riskLevels = ['critical', 'high', 'medium', 'low'] // Removed 'expired'
      const itemsByRisk = {
        critical: nonExpiredEmergencyItems.filter(item => item.risk_level === 'critical'),
        high: nonExpiredEmergencyItems.filter(item => item.risk_level === 'high'),
        medium: nonExpiredEmergencyItems.filter(item => item.risk_level === 'medium'),
        low: nonExpiredEmergencyItems.filter(item => item.risk_level === 'low')
      }

      const allAssignments: Array<{
        stock_item_id: string;
        dispenser_id: string;
        assigned_quantity: number;
        deadline: string;
        notes: string;
        assigned_by?: string;
      }> = []

      // Create assignments for each risk category, prioritizing least burdened dispensers
      for (const riskLevel of riskLevels) {
        const items = itemsByRisk[riskLevel as keyof typeof itemsByRisk]
        if (items.length === 0) continue

        // Sort dispensers by current workload for this risk level
        const sortedDispensers = [...dispensers].sort((a, b) => {
          const workloadA = dispenserWorkloads.find(w => w.dispenser_id === a.id)?.workload_score || 0
          const workloadB = dispenserWorkloads.find(w => w.dispenser_id === b.id)?.workload_score || 0
          return workloadA - workloadB
        })

        let dispenserIndex = 0
        
        for (const item of items) {
          let remainingQuantity = item.quantity
          
          while (remainingQuantity > 0 && dispenserIndex < sortedDispensers.length) {
            const dispenser = sortedDispensers[dispenserIndex]
            const targetQuantity = fairAssignments[dispenser.id]?.[riskLevel] || 0
            
            if (targetQuantity > 0) {
              const assignQuantity = Math.min(remainingQuantity, targetQuantity)
              
              allAssignments.push({
                stock_item_id: item.id,
                dispenser_id: dispenser.id,
                assigned_quantity: assignQuantity,
                deadline: new Date(deadline).toISOString(),
                notes: `Equitable fair distribution - ${riskLevel} risk category (workload-balanced)`,
                assigned_by: user?.id
              })
              
              remainingQuantity -= assignQuantity
              fairAssignments[dispenser.id][riskLevel] -= assignQuantity
            }
            
            dispenserIndex = (dispenserIndex + 1) % sortedDispensers.length
          }
        }
      }

      if (allAssignments.length === 0) {
        toast({
          title: "Error",
          description: "No assignments to create",
          variant: "destructive",
        })
        return
      }

      const { data: createdAssignments, error } = await supabase
        .from('emergency_assignments')
        .insert(allAssignments)
        .select(`
          *,
          stock_item:stock_items(id, product_name, branch_id),
          dispenser:users!dispenser_id(id, name, phone)
        `)

      if (error) throw error

      // Send notifications and record history
      for (const assignment of createdAssignments) {
        const dispenser = dispensers.find(d => d.id === assignment.dispenser_id)
        const item = emergencyItems.find(i => i.id === assignment.stock_item_id)
        
        if (dispenser && item) {
          await sendWhatsAppNotification(assignment, dispenser)
          
          await supabase.from('stock_movement_history').insert({
            stock_item_id: item.id,
            movement_type: 'emergency_assigned',
            quantity_moved: assignment.assigned_quantity,
            from_branch_id: null,
            to_branch_id: null,
            for_dispenser: assignment.dispenser_id,
            notes: `Equitable fair distribution: ${assignment.assigned_quantity} units assigned to ${dispenser.name} (${item.risk_level} risk, workload-balanced)`,
            moved_by: null
          })
        }
      }

      setShowFairAssignDialog(false)
      setDeadline('')
      setNotes('')
      fetchData()

      toast({
        title: "Success",
        description: `Equitable distribution completed: ${allAssignments.length} assignments created with workload balancing`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to create equitable assignments",
        variant: "destructive",
      })
    }
  }

  const updateAssignmentStatus = async (assignmentId: string, status: string) => {
    try {
      const updateData: { status: string; completed_at?: string } = { status }
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('emergency_assignments')
        .update(updateData)
        .eq('id', assignmentId)

      if (error) throw error

      fetchData()
      toast({
        title: "Success",
        description: `Assignment status updated to ${status}`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to update assignment",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Loading emergency management...</p>
        </div>
      </div>
    )
  }

  const emergencyItems = stockItems.filter(item => item.is_emergency)
  const normalItems = stockItems.filter(item => !item.is_emergency)

  normalItems.forEach(item => {
    if (isInCurrentMonth(item.expiry_date)) return;
    const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const cat = getExpiryCategory(daysLeft);
    grouped[cat].push({ ...item, daysLeft });
  });

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'expired': return 'bg-red-600'
      case 'critical': return 'bg-red-500'
      case 'high': return 'bg-orange-500'
      case 'medium': return 'bg-yellow-500'
      case 'low': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const ItemDetailsDialog = ({ item }: { item: StockItem | null }) => {
    if (!item) return null

    const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    const isExpired = daysToExpiry < 0
    const totalValue = item.quantity * item.unit_price

    return (
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Package className="h-6 w-6 text-blue-400" />
              Stock Item Details
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{item.product_name}</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">{item.branch}</span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge 
                    className={`${getRiskColor(item.risk_level || 'low')} text-white mb-2`}
                  >
                    {item.risk_level?.toUpperCase()} RISK
                  </Badge>
                  {item.is_emergency && (
                    <Badge variant="destructive" className="block">
                      EMERGENCY
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-4 text-center">
                  <Package className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{item.quantity}</div>
                  <div className="text-sm text-slate-400">Quantity</div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-4 text-center">
                  <DollarSign className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">
                    ${item.unit_price.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-400">Unit Price</div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-4 text-center">
                  <DollarSign className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">
                    ${totalValue.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-400">Total Value</div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-4 text-center">
                  <Calendar className="h-8 w-8 text-orange-400 mx-auto mb-2" />
                  <div className={`text-2xl font-bold ${isExpired ? 'text-red-400' : 'text-white'}`}>
                    {isExpired ? 'EXPIRED' : `${daysToExpiry}d`}
                  </div>
                  <div className="text-sm text-slate-400">
                    {isExpired ? 'Days ago' : 'Days left'}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Expiry Information */}
            <Card className="bg-slate-700 border-slate-600">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Expiry Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-400">Expiry Date</Label>
                    <div className="text-white font-medium">
                      {format(new Date(item.expiry_date), 'MMM dd, yyyy')}
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Time Remaining</Label>
                    <div className={`font-medium ${isExpired ? 'text-red-400' : 'text-white'}`}>
                      {isExpired 
                        ? `Expired ${Math.abs(daysToExpiry)} days ago`
                        : `${daysToExpiry} days remaining`
                      }
                    </div>
                  </div>
                </div>
                
                {isExpired && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">This item has expired and requires immediate attention</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Emergency Information */}
            {item.is_emergency && (
              <Card className="bg-red-900/20 border-red-700">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Emergency Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-slate-400">Emergency Declared</Label>
                      <div className="text-white font-medium">
                        {item.emergency_declared_at 
                          ? format(new Date(item.emergency_declared_at), 'MMM dd, yyyy HH:mm')
                          : 'Unknown'
                        }
                      </div>
                    </div>
                    <div className="p-3 bg-red-800/30 rounded-lg">
                      <p className="text-red-300 text-sm">
                        This item has been marked as emergency and requires immediate distribution to dispensers.
                        Use the assignment tools to allocate quantities to available dispensers.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              {!item.is_emergency ? (
                <Button 
                  onClick={() => {
                    setShowDetailsDialog(false)
                    declareEmergency(item)
                  }}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Declare Emergency
                </Button>
              ) : (
                <Button 
                  onClick={() => {
                    setSelectedItem(item)
                    setShowDetailsDialog(false)
                    setShowAssignDialog(true)
                  }}
                  className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                >
                  <Users className="h-4 w-4" />
                  Assign to Dispensers
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={() => setShowDetailsDialog(false)}
                className="text-slate-400 border-slate-600 hover:bg-slate-700"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800 px-6 py-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              Emergency Management
            </h1>
            <p className="text-slate-400">Monitor and manage emergency stock assignments with advanced distribution tools</p>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="text-white border-slate-600 hover:bg-slate-700"
            >
              Refresh Data
            </Button>
          </div>
        </div>
      </div>

      {/* Info Note for Administrators */}
      <Card className="mb-6 bg-blue-900/30 border-blue-700">
        <CardContent>
          <div className="text-blue-200 text-sm">
            <strong>Note for Administrators:</strong> Only items that have been marked as emergency and their assignments will appear on this page. If you do not see any items, please declare an emergency for the relevant stock items first.
          </div>
        </CardContent>
      </Card>

      <div className="p-6 space-y-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-600 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">{emergencyItems.length}</div>
                  <div className="text-slate-400">Emergency Items</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 rounded-lg">
                  <Package className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{stockItems.length}</div>
                  <div className="text-slate-400">Total Stock Items</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-600 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{dispensers.length}</div>
                  <div className="text-slate-400">Active Dispensers</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-600 rounded-lg">
                  <Clock className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">{emergencyAssignments.length}</div>
                  <div className="text-slate-400">Active Assignments</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Emergency Items Section */}
        {emergencyItems.length > 0 && (
          <Card className="bg-slate-800 border-red-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Critical Emergency Items ({emergencyItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {emergencyItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-4 border border-red-700/30 rounded-lg bg-red-900/10">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${getRiskColor(item.risk_level || 'low')}`}></div>
                      <div>
                        <h3 className="font-semibold text-white">{item.product_name}</h3>
                        <p className="text-sm text-slate-400">
                          {item.branch} • Qty: {item.quantity} • 
                          Value: ${(item.quantity * item.unit_price).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="destructive" className="text-xs">
                            {item.risk_level?.toUpperCase()} RISK
                          </Badge>
                          <span className="text-xs text-slate-500">
                            Declared: {item.emergency_declared_at ? format(new Date(item.emergency_declared_at), 'MMM dd, HH:mm') : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedItemForDetails(item)
                          setShowDetailsDialog(true)
                        }}
                        className="text-slate-400 border-slate-600 hover:bg-slate-700"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item)
                          setShowAssignDialog(true)
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Assign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Regular Stock Items */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Package className="h-5 w-5" />
              Stock Items - Emergency Declaration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(grouped).every(([_, items]) => items.length === 0) ? (
              <div className="text-center py-8">
                <Package className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">All items are marked as emergency or no items available</p>
              </div>
            ) : (
              <div className="space-y-4 mt-2">
                {Object.entries(grouped).map(([key, items]) => (
                  items.length === 0 ? null : (
                    <div key={key} className="bg-slate-700 border border-slate-600 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-base font-bold text-white">{groupLabels[key]}</div>
                        {items.length > EXPAND_DEFAULT && (
                          <button
                            className="text-blue-400 hover:underline text-xs"
                            onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))}
                          >
                            {expandedGroups[key] ? 'Collapse' : `Expand to view more (${items.length - EXPAND_DEFAULT} items)`}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {(expandedGroups[key] ? items : items.slice(0, EXPAND_DEFAULT)).map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-slate-800 rounded p-2 mb-1">
                            <div>
                              <div className="font-bold text-white text-base">{item.product_name}</div>
                              <div className="text-slate-400 text-sm">{item.branch}</div>
                              <div className="text-slate-400 text-xs">Expiry: {item.expiry_date} | <span className="font-bold text-red-400">{item.daysLeft} days</span></div>
                              <div className="text-slate-400 text-xs">Qty: {item.quantity} | Value: USh {(item.unit_price * item.quantity).toLocaleString()}</div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedItemForDetails(item)
                                  setShowDetailsDialog(true)
                                }}
                                className="text-slate-400 border-slate-600 hover:bg-slate-700"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Details
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => declareEmergency(item)}
                                variant="destructive"
                              >
                                <AlertTriangle className="h-4 w-4 mr-1" />
                                Declare Emergency
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emergency Assignments Table */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5" />
              Emergency Assignments ({emergencyAssignments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {emergencyAssignments.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No emergency assignments created yet</p>
              </div>
            ) : (
              <div className="bg-slate-700 rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600">
                      <TableHead className="text-slate-300">Product</TableHead>
                      <TableHead className="text-slate-300">Dispenser</TableHead>
                      <TableHead className="text-slate-300">Quantity</TableHead>
                      <TableHead className="text-slate-300">Deadline</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      <TableHead className="text-slate-300">WhatsApp</TableHead>
                      <TableHead className="text-slate-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emergencyAssignments.map((assignment) => (
                      <TableRow key={assignment.id} className="border-slate-600">
                        <TableCell>
                          <div>
                            <div className="font-medium text-white">{assignment.stock_item?.product_name}</div>
                            <div className="text-sm text-slate-400">{assignment.stock_item?.branch}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-white">{assignment.dispenser?.name}</div>
                            <div className="text-sm text-slate-400">{assignment.dispenser?.branch}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-white">{assignment.assigned_quantity}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-white">
                            <Clock className="h-3 w-3" />
                            {format(new Date(assignment.deadline), 'MMM dd, HH:mm')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            assignment.status === 'completed' ? 'default' :
                            assignment.status === 'pending' ? 'secondary' : 'outline'
                          }>
                            {assignment.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {assignment.dispenser?.whatsapp_number ? (
                            <div className="flex items-center gap-1 text-green-400">
                              <MessageCircle className="h-3 w-3" />
                              <span className="text-xs">Sent</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">No WhatsApp</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {assignment.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateAssignmentStatus(assignment.id, 'completed')}
                              className="text-white border-slate-600 hover:bg-slate-600"
                            >
                              Mark Complete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Dispensers</DialogTitle>
            <DialogDescription>
              Select quantities to assign to each dispenser for this emergency item.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="text-slate-300">Product: <span className="font-bold text-white">{selectedItem.product_name}</span></div>
              <div className="text-slate-300">Branch: <span className="font-bold text-white">{selectedItem.branch}</span></div>
              <div className="text-slate-300">Total Quantity: <span className="font-bold text-white">{selectedItem.quantity}</span></div>
              <div className="space-y-2">
                {filteredDispensers.length === 0 ? (
                  <div className="text-red-400">No dispensers found for this branch.</div>
                ) : (
                  filteredDispensers.map(d => (
                    <div key={d.id} className="flex items-center gap-2">
                      <div className="flex-1 text-white">{d.name}</div>
                      <Input
                        type="number"
                        min={0}
                        max={selectedItem.quantity}
                        value={dispenserAssignments[d.id] || ''}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setDispenserAssignments(prev => ({ ...prev, [d.id]: val }));
                        }}
                        className="w-24 bg-slate-700 text-white border-slate-600"
                        placeholder="Qty"
                      />
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
                <Button onClick={assignToDispensers} className="bg-blue-600 hover:bg-blue-700">Assign</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
            <DialogDescription>
              Detailed information about this stock item.
            </DialogDescription>
          </DialogHeader>
          {selectedItemForDetails && (
            <div className="space-y-3">
              <div className="text-lg font-bold text-white">{selectedItemForDetails.product_name}</div>
              <div className="text-slate-300">Branch: <span className="font-bold text-white">{selectedItemForDetails.branch}</span></div>
              <div className="text-slate-300">Quantity: <span className="font-bold text-white">{selectedItemForDetails.quantity}</span></div>
              <div className="text-slate-300">Unit Price: <span className="font-bold text-white">{selectedItemForDetails.unit_price}</span></div>
              <div className="text-slate-300">Expiry Date: <span className="font-bold text-white">{selectedItemForDetails.expiry_date}</span></div>
              <div className="text-slate-300">Risk Level: <span className="font-bold text-white">{selectedItemForDetails.risk_level}</span></div>
              <div className="text-slate-300">Emergency Declared At: <span className="font-bold text-white">{selectedItemForDetails.emergency_declared_at ? format(new Date(selectedItemForDetails.emergency_declared_at), 'MMM dd, yyyy HH:mm') : 'N/A'}</span></div>
              {selectedItemForDetails.is_emergency && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await supabase.from('stock_items').update({ is_emergency: false, emergency_declared_at: null }).eq('id', selectedItemForDetails.id);
                    setShowDetailsDialog(false);
                    fetchData();
                    toast({ title: 'Removed from Emergency', description: `${selectedItemForDetails.product_name} is no longer marked as emergency.` });
                  }}
                  className="w-full mt-2"
                >
                  Remove from Emergency
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)} className="w-full mt-2">Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EmergencyManager
