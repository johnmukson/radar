import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, User, Download, Plus, MessageCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/integrations/supabase/types'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface UnifiedAssignment {
  id: string
  source_type: 'weekly_task' | 'assigned_product'
  display_name: string
  description: string | null
  assigned_to: string
  assigned_by: string | null
  date_field: string
  priority: string
  status: string
  whatsapp_sent: boolean
  whatsapp_sent_at: string | null
  created_at: string
  updated_at: string
  assigned_user_name: string | null
  assigned_user_phone: string | null
  assigned_by_user_name: string | null
  product_name: string | null
  quantity: number | null
  unit_price: number | null
  expiry_date: string | null
  branch_id: string | null
  branch_name: string | null
  risk_level: string
}

type Dispenser = { id: string; name: string };

// Helper to get next 12 months for dropdown
function getNext12Months() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      value: d.toISOString().slice(0, 7), // YYYY-MM
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
    });
  }
  return months;
}

const DispenserTasks = () => {
  const { user, signOut } = useAuth()
  const { hasAdminAccess, loading: roleLoading } = useUserRole()
  const { toast } = useToast()

  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [selectedDispenser, setSelectedDispenser] = useState<string>('')
  const [assignedProducts, setAssignedProducts] = useState<UnifiedAssignment[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedMonth, setSelectedMonth] = useState(getNext12Months()[0].value)
  const [selectedWeek, setSelectedWeek] = useState('1')
  
  // Task creation states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')

  const fetchAssignedProducts = useCallback(async (dispenserId: string, month: string, week: string) => {
    setLoading(true);
    if (!dispenserId) {
      setAssignedProducts([]);
      setLoading(false);
      return;
    }

    const year = parseInt(month.split('-')[0]);
    const monthNum = parseInt(month.split('-')[1]) - 1;
    const weekNum = parseInt(week);

    const weekStartDay = (weekNum - 1) * 7 + 1;
    const startDate = new Date(Date.UTC(year, monthNum, weekStartDay));
    const endDate = new Date(Date.UTC(year, monthNum, weekStartDay + 6));

    try {
      const { data, error } = await supabase
        .from('unified_assignments_view')
        .select('*')
        .eq('assigned_to', dispenserId)
        .gte('date_field', startDate.toISOString().split('T')[0])
        .lte('date_field', endDate.toISOString().split('T')[0])
        .order('date_field', { ascending: true });

      if (error) throw error;
      
      // Calculate dynamic priority based on available tasks
      const calculateDynamicPriority = (tasks: any[]) => {
        const tasksByRisk = tasks.reduce((acc, task) => {
          const riskLevel = task.risk_level || 'very-low'
          if (!acc[riskLevel]) acc[riskLevel] = []
          acc[riskLevel].push(task)
          return acc
        }, {} as Record<string, any[]>)

        const originalRiskOrder = ['critical', 'high', 'medium-high', 'medium', 'low', 'very-low']
        
        let highestAvailableRisk = null
        for (const risk of originalRiskOrder) {
          if (tasksByRisk[risk] && tasksByRisk[risk].length > 0) {
            highestAvailableRisk = risk
            break
          }
        }

        if (!highestAvailableRisk) {
          return { 'critical': 1, 'high': 2, 'medium-high': 3, 'medium': 4, 'low': 5, 'very-low': 6 }
        }

        const dynamicPriority: Record<string, number> = {}
        let currentPriority = 1

        for (const risk of originalRiskOrder) {
          if (tasksByRisk[risk] && tasksByRisk[risk].length > 0) {
            dynamicPriority[risk] = currentPriority
            currentPriority++
          }
        }

        return dynamicPriority
      }
      
      const dynamicPriority = calculateDynamicPriority(data || [])
      
      const sortedData = (data || []).sort((a, b) => {
        // First sort by dynamic priority
        const aPriority = dynamicPriority[a.risk_level as keyof typeof dynamicPriority] || 999
        const bPriority = dynamicPriority[b.risk_level as keyof typeof dynamicPriority] || 999
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority
        }
        
        // If same priority, sort by expiry date (soonest first)
        const aDate = new Date(a.date_field)
        const bDate = new Date(b.date_field)
        return aDate.getTime() - bDate.getTime()
      })
      
      setAssignedProducts(sortedData);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message || "Failed to fetch assignments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load dispensers
  useEffect(() => {
    const loadInitialData = async () => {
      if (!hasAdminAccess && user) {
        setSelectedDispenser(user.id);
        return;
      }

      if (hasAdminAccess) {
        try {
          const { data, error } = await supabase.from('users_with_roles').select('user_id, name').eq('role', 'dispenser');
          if (error) throw error;

          const dispenserList = data.map(d => ({ id: d.user_id, name: d.name }));
          setDispensers(dispenserList);

          if (dispenserList.length > 0) {
            setSelectedDispenser(dispenserList[0].id);
          }
          setLoading(false);
        }
        catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          toast({ title: "Error", description: message || "Failed to load dispensers", variant: "destructive" });
        }
      }
    };

    if (!roleLoading) {
      loadInitialData();
    }
  }, [hasAdminAccess, roleLoading, toast, user]);

  // Effect for fetching tasks when filters change
  useEffect(() => {
    let targetId = '';
    if (hasAdminAccess) {
      targetId = selectedDispenser;
    } else if (user) {
      targetId = user.id;
    }
    
    if (targetId) {
      fetchAssignedProducts(targetId, selectedMonth, selectedWeek);
    }
  }, [selectedDispenser, selectedMonth, selectedWeek, hasAdminAccess, user, fetchAssignedProducts]);

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      // Find the task to determine its type
      const task = assignedProducts.find(t => t.id === taskId);
      
      if (!task) {
        toast({ title: 'Task not found', variant: 'destructive' });
        return;
      }
      
      let error: Error | null = null;
      
      // Update based on source type
      if (task.source_type === 'weekly_task') {
        const { error: taskError } = await supabase
          .from('weekly_tasks')
          .update({ status })
          .eq('id', taskId);
        error = taskError;
      } else if (task.source_type === 'assigned_product') {
        const { error: productError } = await supabase
          .from('stock_items')
          .update({ status })
          .eq('id', taskId);
        error = productError;
      }

      if (error) throw error;

      // Update local state
      setAssignedProducts(prev => prev.map(task => 
        task.id === taskId ? { ...task, status } : task
      ));

      toast({
        title: "Success",
        description: `${task.source_type === 'weekly_task' ? 'Task' : 'Product'} status updated to ${status}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  // Task creation function
  const createTask = async () => {
    if (!title || !selectedDispenser || !dueDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: task, error } = await supabase
        .from('weekly_tasks')
        .insert({
          title,
          description: description || null,
          assigned_to: selectedDispenser,
          assigned_by: user?.id,
          due_date: dueDate,
          priority
        })
        .select()
        .single()

      if (error) throw error

      setShowCreateDialog(false)
      setTitle('')
      setDescription('')
      setDueDate('')
      setPriority('medium')
      
      // Refresh data
      const targetId = hasAdminAccess ? selectedDispenser : user?.id
      if (targetId) {
        fetchAssignedProducts(targetId, selectedMonth, selectedWeek)
      }

      toast({
        title: "Success",
        description: "Task created successfully",
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error",
        description: message || "Failed to create task",
        variant: "destructive",
      })
    }
  }

  const handleDownload = () => {
    if (assignedProducts.length === 0) {
      toast({ title: 'No assignments to download', variant: 'destructive' });
      return;
    }

    const headers = ['Type', 'Title/Product', 'Description', 'Date', 'Status', 'Priority/Risk', 'Week', 'Day of Week', 'Quantity', 'Unit Price', 'Branch'];
    const csvData = assignedProducts.map(task => [
      task.source_type === 'weekly_task' ? 'Task' : 'Product',
      task.display_name,
      task.description || '',
      task.date_field,
      task.status,
      task.source_type === 'weekly_task' ? task.priority : task.risk_level,
      selectedWeek,
      new Date(task.date_field).toLocaleDateString('en-US', { weekday: 'long' }),
      task.quantity || '',
      task.unit_price || '',
      task.branch_name || ''
    ]);

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assignments-week-${selectedWeek}-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Download started', description: 'CSV file is being downloaded' });
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white">
      <div className="border-b border-slate-700 bg-slate-800 px-6 py-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Assignments</h1>
          <p className="text-slate-400">View and manage your daily assignments (1 per day, 7 per week)</p>
        </div>
      </div>
      
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header with Admin Actions */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Week {selectedWeek} Assignments</h2>
            <p className="text-slate-400">{getNext12Months().find(m => m.value === selectedMonth)?.label}</p>
          </div>
          {hasAdminAccess && (
            <div className="flex gap-3">
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-800 border-slate-700">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create New Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="title" className="text-slate-300">Task Title</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Enter task title"
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dispenser" className="text-slate-300">Assign to Dispenser</Label>
                        <Select value={selectedDispenser} onValueChange={setSelectedDispenser}>
                          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                            <SelectValue placeholder="Select dispenser" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {dispensers.map((dispenser) => (
                              <SelectItem key={dispenser.id} value={dispenser.id}>
                                {dispenser.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="dueDate" className="text-slate-300">Due Date</Label>
                        <Input
                          id="dueDate"
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="priority" className="text-slate-300">Priority</Label>
                        <Select value={priority} onValueChange={setPriority}>
                          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="description" className="text-slate-300">Description</Label>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter task description"
                        className="bg-slate-700 border-slate-600 text-white"
                        rows={4}
                      />
                    </div>
                    <Button 
                      onClick={createTask}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={!title || !selectedDispenser || !dueDate}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Task
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button 
                onClick={() => toast({
                  title: "Notification Sent",
                  description: "Dispensers have been notified to check their assignments",
                })}
                className="bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Notify Dispensers
              </Button>
            </div>
          )}
        </div>

        {/* Filters Section */}
        <div className="flex flex-wrap gap-4 mb-6 items-end">
          {hasAdminAccess && (
            <div className="flex-1 min-w-[200px]">
              <label className="block mb-1 text-slate-300 text-sm font-medium">Dispenser</label>
              <Select value={selectedDispenser} onValueChange={setSelectedDispenser}>
                <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select a dispenser" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {dispensers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-[150px]">
            <label className="block mb-1 text-slate-300 text-sm font-medium">Month</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {getNext12Months().map((m, index) => (
                  <SelectItem key={`${m.value}-${index}`} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[120px]">
            <label className="block mb-1 text-slate-300 text-sm font-medium">Week</label>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="1">Week 1</SelectItem>
                <SelectItem value="2">Week 2</SelectItem>
                <SelectItem value="3">Week 3</SelectItem>
                <SelectItem value="4">Week 4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleDownload} variant="outline" className="h-10 border-slate-700 text-slate-300 hover:bg-slate-800">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Daily Assignments View */}
        {!loading && (
          <div className="space-y-4">
            {assignedProducts.length === 0 ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="py-8 text-center text-slate-400">
                  No assignments found for this week.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7].map(dayNum => {
                  const dayAssignments = assignedProducts.filter((_, index) => index + 1 === dayNum);
                  const assignment = dayAssignments[0];
                  
                  return (
                    <Card key={dayNum} className="bg-slate-800 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="text-lg font-semibold text-white mb-1">
                              Day {dayNum}: {assignment ? assignment.display_name : 'No assignment'}
                            </div>
                            {assignment && (
                              <div className="text-sm text-slate-300 space-y-1">
                                <div>📝 {assignment.description || 'No description'}</div>
                                {assignment.source_type === 'assigned_product' && (
                                  <div>
                                    📦 Qty: {assignment.quantity} | 💰 Price: ${assignment.unit_price} | 🏢 Branch: {assignment.branch_name || 'No Branch'}
                                  </div>
                                )}
                                <div>📅 Due: {format(new Date(assignment.date_field), 'MMM dd, yyyy')}</div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {assignment && (
                              <>
                                <Badge 
                                  variant={
                                    assignment.status === 'completed' ? 'default' : 
                                    assignment.status === 'in_progress' ? 'secondary' : 'outline'
                                  }
                                >
                                  {assignment.status}
                                </Badge>
                                <Select value={assignment.status} onValueChange={(status) => updateTaskStatus(assignment.id, status)}>
                                  <SelectTrigger className="w-32 h-8 bg-slate-600 border-slate-500 text-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-700 border-slate-600">
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </>
                            )}
                            {!assignment && (
                              <div className="text-sm text-slate-500">Rest day</div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default DispenserTasks