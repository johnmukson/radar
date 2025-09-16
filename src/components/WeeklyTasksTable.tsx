import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Edit, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import RiskLevelDefinitions from '@/components/RiskLevelDefinitions'

interface WeeklyTask {
  id: string
  title: string
  description: string | null
  assigned_to: string
  assigned_by: string
  due_date: string
  priority: string
  status: string
  whatsapp_sent: boolean
  whatsapp_sent_at: string | null
  created_at: string
  updated_at: string
  assignee?: { name: string }
  assigner?: { name: string }
  risk_level?: string
  days_until_due?: number
  product_id?: string
  available_quantity?: number
  product_name?: string
}

interface StockItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  expiry_date: string
  branch: string
  branch_id: string | null
  status: string
  created_at: string
  updated_at: string
  days_to_expiry?: number
  risk_level?: string
}

// Calculate risk level based on due date (only for non-expired items)
const calculateRiskLevel = (dueDate: string): string => {
  const today = new Date()
  const due = new Date(dueDate)
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysUntilDue <= 30) return 'critical'      // 0-30 days
  if (daysUntilDue <= 60) return 'high'          // 31-60 days (Critical range)
  if (daysUntilDue <= 90) return 'medium-high'   // 61-90 days (High priority range)
  if (daysUntilDue <= 120) return 'medium-high'  // 91-120 days (Medium-high priority range)
  if (daysUntilDue <= 180) return 'medium'       // 121-180 days (Medium priority range)
  if (daysUntilDue <= 365) return 'low'          // 181-365 days (Low priority range)
  return 'very-low'                              // 365+ days (Very low priority range)
}

const WeeklyTasksTable = () => {
  const [allTasks, setAllTasks] = useState<WeeklyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [daysFilter, setDaysFilter] = useState<string>('all')
  const [dispenserFilter, setDispenserFilter] = useState<string>('all')
  const [dispensers, setDispensers] = useState<{id: string, name: string}[]>([])
  
  // Stock search and adjust quantity states
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [stockSearchTerm, setStockSearchTerm] = useState('')
  const [showStockSearch, setShowStockSearch] = useState(false)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(1)
  const [adjustLoading, setAdjustLoading] = useState(false)
  const { toast } = useToast()

  const fetchTasks = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const { data, error } = await supabase
        .from('weekly_tasks')
        .select(`
          *,
          assignee:assigned_to(name),
          assigner:assigned_by(name)
        `)
        .order('due_date', { ascending: true })
      
      if (error) throw error
      
      // Fetch stock items to get quantities
      const { data: stockItems, error: stockError } = await supabase
        .from('stock_items')
        .select('id, product_name, quantity')
      
      if (stockError) {
        console.warn('Could not fetch stock items:', stockError)
      }
      
      // Filter out expired items and calculate risk levels
      const today = new Date()
      const tasksWithRisk = (data || [])
        .filter(task => {
          const due = new Date(task.due_date)
          const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          return daysUntilDue >= 0 // Only show non-expired items
        })
        .map(task => {
          const due = new Date(task.due_date)
          const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          
          // Try to find matching stock item by product name
          const productName = task.title.replace('Move ', '').trim()
          const matchingStockItem = stockItems?.find(item => {
            const itemName = item.product_name.toLowerCase()
            const searchName = productName.toLowerCase()
            return itemName === searchName || itemName.includes(searchName) || searchName.includes(itemName)
          })
          
          return {
            ...task,
            risk_level: calculateRiskLevel(task.due_date),
            days_until_due: daysUntilDue,
            product_id: matchingStockItem?.id || null,
            available_quantity: matchingStockItem?.quantity || 0,
            product_name: matchingStockItem?.product_name || task.title
          }
        })
      
      // Sort by risk level (critical -> high -> low -> very-low)
      const sortedTasks = tasksWithRisk.sort((a, b) => {
        const riskOrder = { critical: 1, high: 2, low: 3, 'very-low': 4 }
        const riskA = riskOrder[a.risk_level as keyof typeof riskOrder] || 6
        const riskB = riskOrder[b.risk_level as keyof typeof riskOrder] || 6
        
        if (riskA !== riskB) return riskA - riskB
        
        // If same risk level, sort by due date (earliest first)
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      })
      
      setAllTasks(sortedTasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
    } finally {
      setLoading(false)
    }
  }

  // Fetch dispensers
  const fetchDispensers = async () => {
    try {
      // Try different approaches to get dispensers
      let data, error
      
      // First try: users table with role column
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('role', 'dispenser')
      
      if (!usersError && usersData && usersData.length > 0) {
        data = usersData
        error = null
      } else {
        // Second try: users_with_roles view
        const { data: rolesData, error: rolesError } = await supabase
          .from('users_with_roles')
          .select('user_id, name')
          .eq('role', 'dispenser')
        
        if (!rolesError && rolesData && rolesData.length > 0) {
          data = rolesData.map(d => ({ id: d.user_id, name: d.name }))
          error = null
          } else {
            // Third try: get all users and filter by name patterns
            const { data: allUsers, error: allUsersError } = await supabase
              .from('users')
              .select('id, name')
            
            if (!allUsersError && allUsers) {
              // Filter users that might be dispensers (you can adjust this logic)
              const filteredUsers = allUsers.filter(user => 
                user.name && (
                  user.name.toLowerCase().includes('dispenser') ||
                  user.name.toLowerCase().includes('pharmacist') ||
                  user.name.toLowerCase().includes('staff')
                )
              )
              
              // If no filtered users, show all users as fallback
              data = filteredUsers.length > 0 ? filteredUsers : allUsers
              error = null
            } else {
              error = allUsersError
            }
          }
      }
      
      if (error) throw error
      setDispensers(data || [])
      console.log('Fetched dispensers:', data)
    } catch (err) {
      console.error('Error fetching dispensers:', err)
      // Set some default dispensers for testing
      setDispensers([
        { id: 'test-1', name: 'Test Dispenser 1' },
        { id: 'test-2', name: 'Test Dispenser 2' }
      ])
    }
  }

  // Fetch stock items for search
  const fetchStockItems = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_items')
        .select(`
          *,
          branches(name)
        `)
        .order('product_name', { ascending: true })
      
      if (error) throw error
      
      const itemsWithCalculations = (data || []).map(item => {
        const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        let riskLevel = 'very-low'
        
        if (daysToExpiry < 0) riskLevel = 'expired'
        else if (daysToExpiry <= 30) riskLevel = 'critical'
        else if (daysToExpiry <= 60) riskLevel = 'high'
        else if (daysToExpiry <= 180) riskLevel = 'low'
        
        return {
          ...item,
          branch: item.branches?.name || 'Unknown Branch',
          days_to_expiry: daysToExpiry,
          risk_level: riskLevel
        }
      })
      
      setStockItems(itemsWithCalculations)
    } catch (err) {
      console.error('Error fetching stock items:', err)
      toast({
        title: 'Error',
        description: 'Failed to fetch stock items',
        variant: 'destructive'
      })
    }
  }

  // Handle quantity adjustment
  const handleAdjustQuantity = async () => {
    if (!adjustItem || adjustQty < 1 || adjustQty > adjustItem.quantity) {
      console.log('Validation failed:', { adjustItem: !!adjustItem, adjustQty, maxQty: adjustItem?.quantity })
      return
    }
    
    setAdjustLoading(true)
    try {
      const newQty = adjustItem.quantity - adjustQty
      console.log('Adjusting quantity:', { current: adjustItem.quantity, adjust: adjustQty, new: newQty })
      
      const updateObj: { quantity: number; status?: string } = { quantity: newQty }
      if (newQty === 0) updateObj.status = 'completed'
      
      const { error: updateError } = await supabase
        .from('stock_items')
        .update(updateObj)
        .eq('id', adjustItem.id)
      
      if (updateError) {
        console.error('Stock update error:', updateError)
        throw updateError
      }
      
      // Record movement
      const { data: { user } } = await supabase.auth.getUser()
      console.log('Recording movement for user:', user?.id, 'Product:', adjustItem.product_name)
      
      const movementType = newQty === 0 ? 'completion' : 'adjustment'
      const notes = newQty === 0 
        ? `Product completed: ${adjustQty} units removed from ${adjustItem.product_name}`
        : `Quantity adjusted: ${adjustQty} units removed from ${adjustItem.product_name}`
      
      const { error: movementError } = await supabase.from('stock_movement_history').insert({
        stock_item_id: adjustItem.id,
        movement_type: movementType,
        quantity_moved: adjustQty,
        from_branch_id: adjustItem.branch_id,
        to_branch_id: null,
        for_dispenser: user?.id || null,
        notes: notes,
        moved_by: user?.id || null,
        movement_date: new Date().toISOString()
      })

      if (movementError) {
        console.error('Movement recording error:', movementError)
        throw movementError
      }

      // If quantity reached zero, update any associated weekly_tasks to completed
      if (newQty === 0) {
        const { error: taskUpdateError } = await supabase
          .from('weekly_tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('product_id', adjustItem.id)
          .eq('status', 'pending')
        
        if (taskUpdateError) {
          console.error('Task update error:', taskUpdateError)
          // Don't throw here, as the main operation succeeded
        }
      }
      
      setAdjustDialogOpen(false)
      setAdjustItem(null)
      setAdjustQty(1)
      
      // Update local state
      setStockItems(prev => prev.map(item => 
        item.id === adjustItem.id ? { ...item, quantity: newQty } : item
      ))
      
      toast({
        title: 'Success',
        description: 'Stock quantity adjusted successfully',
      })
    } catch (error: unknown) {
      console.error('Error adjusting quantity:', error)
      
      let errorMessage = 'Failed to adjust quantity'
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = `Failed to adjust quantity: ${error.message}`
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setAdjustLoading(false)
    }
  }

  // Open adjust dialog
  const handleOpenAdjust = (item: StockItem) => {
    setAdjustItem(item)
    setAdjustQty(1)
    setAdjustDialogOpen(true)
  }

  useEffect(() => {
    fetchTasks()
    fetchDispensers()
    fetchStockItems() // Load stock items initially for adjust buttons
  }, [])

  // Debounced search effect
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (stockSearchTerm.trim()) {
        fetchStockItems()
      }
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [stockSearchTerm])

  // Filter tasks based on days remaining and dispenser
  const tasks = useMemo(() => {
    let filteredTasks = allTasks
    
    // Filter by dispenser
    if (dispenserFilter !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.assigned_to === dispenserFilter)
    }
    
    // Filter by days
    if (daysFilter !== 'all') {
      const today = new Date()
      filteredTasks = filteredTasks.filter(task => {
        const due = new Date(task.due_date)
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        
        switch (daysFilter) {
          case '0-30':
            return daysUntilDue >= 0 && daysUntilDue <= 30
          case '31-60':
            return daysUntilDue >= 31 && daysUntilDue <= 60
          case '61-90':
            return daysUntilDue >= 61 && daysUntilDue <= 90
          case '91-120':
            return daysUntilDue >= 91 && daysUntilDue <= 120
          case '121-180':
            return daysUntilDue >= 121 && daysUntilDue <= 180
          case '181-365':
            return daysUntilDue >= 181 && daysUntilDue <= 365
          case '365+':
            return daysUntilDue > 365
          default:
            return true
        }
      })
    }
    
    return filteredTasks
  }, [allTasks, daysFilter, dispenserFilter])

  // Filter stock items based on search term
  const filteredStockItems = useMemo(() => {
    if (!stockSearchTerm) return []
    return stockItems.filter(item => 
      item.product_name.toLowerCase().includes(stockSearchTerm.toLowerCase())
    )
  }, [stockItems, stockSearchTerm])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'in_progress': return 'bg-blue-500'
      case 'pending': return 'bg-yellow-500'
      case 'cancelled': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-600'
      case 'high': return 'bg-orange-500'
      case 'medium': return 'bg-yellow-500'
      case 'low': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return 'bg-red-600'      // 0-30 days
      case 'high': return 'bg-orange-500'       // 31-60 days (Critical range)
      case 'medium-high': return 'bg-yellow-500' // 61-120 days (High/Medium-high priority range)
      case 'medium': return 'bg-green-500'      // 121-180 days (Medium priority range)
      case 'low': return 'bg-blue-500'          // 181-365 days (Low priority range)
      case 'very-low': return 'bg-gray-500'     // 365+ days (Very low priority range)
      default: return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-8 text-center text-red-400">
          <h3 className="text-lg font-semibold mb-2">Error Loading Tasks</h3>
          <p className="mb-4">{error}</p>
          <Button onClick={fetchTasks} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
             <div className="flex justify-between items-center">
               <h2 className="text-2xl font-bold text-white">Weekly Tasks Table Contents</h2>
               <div className="flex gap-2">
                 <Button 
                   onClick={() => {
                     setShowStockSearch(!showStockSearch)
                     if (!showStockSearch) {
                       fetchStockItems()
                     }
                   }} 
                   variant="outline" 
                   className="border-slate-600 text-slate-300 hover:bg-slate-700"
                 >
                   <Search className="h-4 w-4 mr-2" />
                   {showStockSearch ? 'Hide Stock Search' : 'Search Stock'}
                 </Button>
                 <Button onClick={fetchTasks} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                   <RefreshCw className="h-4 w-4 mr-2" />
                   Refresh
                 </Button>
               </div>
             </div>

      {/* Risk Level Definitions */}
      <div className="mb-6">
        <RiskLevelDefinitions />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-slate-300 font-medium">Dispenser:</label>
          <Select value={dispenserFilter} onValueChange={setDispenserFilter}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Select dispenser" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">All Dispensers</SelectItem>
              {dispensers.length > 0 ? (
                dispensers.map(dispenser => (
                  <SelectItem key={dispenser.id} value={dispenser.id}>
                    {dispenser.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-dispensers" disabled>
                  No dispensers found
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-400">
            ({dispensers.length} dispensers)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-300 font-medium">Days remaining:</label>
          <Select value={daysFilter} onValueChange={setDaysFilter}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="0-30">0-30 days (Critical)</SelectItem>
              <SelectItem value="31-60">31-60 days (High Priority)</SelectItem>
              <SelectItem value="61-90">61-90 days (2-3 months)</SelectItem>
              <SelectItem value="91-120">91-120 days (3-4 months)</SelectItem>
              <SelectItem value="121-180">121-180 days (4-6 months)</SelectItem>
              <SelectItem value="181-365">181-365 days (6-12 months)</SelectItem>
              <SelectItem value="365+">More than 1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>

               <Button 
                 onClick={() => {
                   setDispenserFilter('all')
                   setDaysFilter('31-60')
                 }}
                 variant="outline" 
                 className="border-slate-600 text-slate-300 hover:bg-slate-700"
               >
                 Clear Filters
               </Button>
             </div>

             {/* Stock Search Section */}
             {showStockSearch && (
               <div className="space-y-6">
                 {/* Search Header */}
                 <div className="text-center">
                   <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2 mb-2">
                     <Search className="h-6 w-6" />
                     Product Search
                   </h2>
                 </div>

                 {/* Search Section */}
                 <Card className="bg-slate-800 border-slate-700">
                   <CardContent className="p-6">
                     <div className="space-y-4">
                       <div>
                         <Label htmlFor="stock-search" className="text-white text-lg font-medium">Search Products</Label>
                         <Input
                           id="stock-search"
                           placeholder="Enter product name to search..."
                           value={stockSearchTerm}
                           onChange={(e) => setStockSearchTerm(e.target.value)}
                           className="mt-2 bg-slate-700 border-slate-600 text-white text-lg py-3"
                         />
                         <p className="text-slate-300 mt-2">
                           Search for products by name. Results will show similar products and exact matches.
                         </p>
                       </div>
                       
                       {filteredStockItems.length > 0 && (
                         <div className="space-y-3">
                           {filteredStockItems.map((item) => (
                             <Card key={item.id} className="bg-slate-700 border-slate-600">
                               <CardContent className="p-4">
                                 <div className="flex items-center justify-between">
                                   <div className="flex-1">
                                     <h3 className="font-semibold text-white text-lg mb-2">{item.product_name}</h3>
                                     <div className="flex items-center gap-4 text-sm text-slate-300">
                                       <span>Branch: {item.branch}</span>
                                       <span>Qty: {item.quantity}</span>
                                       <span>Price: ${item.unit_price}</span>
                                       <span className={`font-medium ${
                                         item.days_to_expiry! <= 30 ? 'text-red-500' :
                                         item.days_to_expiry! <= 60 ? 'text-orange-500' :
                                         item.days_to_expiry! <= 180 ? 'text-green-500' : 'text-blue-500'
                                       }`}>
                                         {item.days_to_expiry} days left
                                       </span>
                                     </div>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <Badge className={`${getRiskColor(item.risk_level!)} text-white text-xs`}>
                                       {item.risk_level?.toUpperCase()}
                                     </Badge>
                                     <Button
                                       onClick={() => handleOpenAdjust(item)}
                                       size="sm"
                                       className="bg-blue-600 hover:bg-blue-700 text-white"
                                     >
                                       <Edit className="h-4 w-4 mr-1" />
                                       Adjust
                                     </Button>
                                   </div>
                                 </div>
                               </CardContent>
                             </Card>
                           ))}
                         </div>
                       )}
                       
                       {stockSearchTerm && filteredStockItems.length === 0 && (
                         <Card className="bg-slate-700 border-slate-600">
                           <CardContent className="py-8 text-center text-slate-400">
                             <h3 className="text-lg font-semibold mb-2">No Products Found</h3>
                             <p>No products found matching "{stockSearchTerm}"</p>
                           </CardContent>
                         </Card>
                       )}
                     </div>
                   </CardContent>
                 </Card>
               </div>
             )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{tasks.length}</div>
            <div className="text-slate-400">Total Tasks</div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">
              {tasks.filter(t => t.status === 'pending').length}
            </div>
            <div className="text-slate-400">Pending</div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">
              {tasks.filter(t => t.status === 'completed').length}
            </div>
            <div className="text-slate-400">Completed</div>
          </CardContent>
        </Card>
      </div>

      {tasks.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="py-8 text-center text-slate-400">
            <h3 className="text-lg font-semibold mb-2">No Tasks Found</h3>
            <p>The weekly_tasks table is empty.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id} className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-lg mb-1">{task.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-slate-300">
                      <span>
                        <span className="text-slate-400">Assigned to:</span> 
                        <span className="text-white font-medium ml-1">
                          {task.assignee?.name || 'Unknown User'}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-400">Due:</span> 
                        <span className="text-white ml-1">{new Date(task.due_date).toLocaleDateString()}</span>
                      </span>
                      <span className={`font-medium ${
                        task.days_until_due! <= 30 ? 'text-red-500' :      // Critical
                        task.days_until_due! <= 60 ? 'text-orange-500' :   // High
                        task.days_until_due! <= 180 ? 'text-green-500' :   // Low
                        'text-blue-500'                                     // Very Low
                      }`}>
                        {task.days_until_due} days left
                      </span>
                      <span>
                        <span className="text-slate-400">Available:</span> 
                        <span className={`text-white font-medium ml-1 ${
                          task.available_quantity === 0 ? 'text-red-500' :
                          task.available_quantity! <= 5 ? 'text-orange-500' :
                          'text-green-500'
                        }`}>
                          {task.available_quantity || 0} units
                        </span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={`${getRiskColor(task.risk_level!)} text-white text-xs`}>
                      {task.risk_level?.toUpperCase()}
                    </Badge>
                    <Badge className={`${getStatusColor(task.status)} text-white text-xs`}>
                      {task.status}
                    </Badge>
                    <Badge className={`${getPriorityColor(task.priority)} text-white text-xs`}>
                      {task.priority}
                    </Badge>
                    <Button
                      onClick={() => {
                        // Find the corresponding stock item for this task
                        const productName = task.title.replace('Move ', '').trim()
                        const stockItem = stockItems.find(item => {
                          const itemName = item.product_name.toLowerCase()
                          const searchName = productName.toLowerCase()
                          // Try exact match first, then partial match
                          return itemName === searchName || 
                                 itemName.includes(searchName) || 
                                 searchName.includes(itemName)
                        })
                        
                        if (stockItem) {
                          handleOpenAdjust(stockItem)
                        } else {
                          // If no stock item found, show search dialog
                          setShowStockSearch(true)
                          setStockSearchTerm(productName)
                          toast({
                            title: 'Product Not Found',
                            description: `Could not find stock item for "${productName}". Please search manually.`,
                            variant: 'destructive'
                          })
                        }
                      }}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Adjust
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Adjust Quantity Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-white text-lg font-semibold">Adjust Stock Quantity</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdjustDialogOpen(false)}
              className="text-slate-400 hover:text-white p-1 h-8 w-8"
            >
              ×
            </Button>
          </DialogHeader>
          {adjustItem && (
            <div className="space-y-6 py-4">
              {/* Product Details */}
              <div className="space-y-3">
                <div>
                  <span className="text-slate-300">Product:</span>
                  <div className="text-white font-medium mt-1">{adjustItem.product_name}</div>
                </div>
                <div>
                  <span className="text-slate-300">Branch:</span>
                  <div className="text-white mt-1">{adjustItem.branch}</div>
                </div>
                <div>
                  <span className="text-slate-300">Current Quantity:</span>
                  <div className="text-white font-bold text-lg mt-1">{adjustItem.quantity} units</div>
                </div>
              </div>
              
              {/* Quantity Input */}
              <div className="space-y-2">
                <Label htmlFor="adjust-qty" className="text-slate-300 text-sm font-medium">
                  Quantity sold or moved
                </Label>
                <div className="flex items-center">
                  <Input
                    id="adjust-qty"
                    type="number"
                    min={1}
                    max={adjustItem.quantity}
                    value={adjustQty}
                    onChange={e => setAdjustQty(Math.max(1, Math.min(adjustItem.quantity, parseInt(e.target.value) || 1)))}
                    className="bg-white border-gray-300 text-gray-900 text-center font-medium"
                    disabled={adjustLoading}
                  />
                  <div className="flex flex-col ml-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjustQty(Math.min(adjustItem.quantity, adjustQty + 1))}
                      disabled={adjustLoading || adjustQty >= adjustItem.quantity}
                      className="h-6 w-6 p-0 border-gray-300 hover:bg-gray-100"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjustQty(Math.max(1, adjustQty - 1))}
                      disabled={adjustLoading || adjustQty <= 1}
                      className="h-6 w-6 p-0 border-gray-300 hover:bg-gray-100"
                    >
                      ↓
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={handleAdjustQuantity} 
                  disabled={adjustLoading || adjustQty < 1 || adjustQty > adjustItem.quantity} 
                  className="flex-1 bg-white text-gray-900 hover:bg-gray-100 font-medium"
                >
                  {adjustLoading ? 'Processing...' : 'Apply Adjustment'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setAdjustDialogOpen(false)} 
                  disabled={adjustLoading}
                  className="bg-gray-600 text-white hover:bg-gray-700 border-gray-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WeeklyTasksTable
