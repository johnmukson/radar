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
import ProductSearch from '@/components/ProductSearch'

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

interface AdjustItem {
  id: string
  source_type: 'weekly_task' | 'assigned_product'
  display_name: string
  quantity: number
  branch_id?: string
  assigned_to?: string
  product_name?: string
  branch?: string
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

  const [showAllTasks, setShowAllTasks] = useState(false);
  const [activeView, setActiveView] = useState<'tasks' | 'search'>('tasks');
  
  // Adjust quantity states
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<AdjustItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(1)
  const [adjustLoading, setAdjustLoading] = useState(false)

  const fetchAssignedProducts = useCallback(async (dispenserId: string, month: string, week: string) => {
    setLoading(true);
    if (!dispenserId) {
      setAssignedProducts([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch from weekly_tasks table - the correct source for assigned products
      let query = supabase
        .from('weekly_tasks')
        .select(`
          *,
          assigned_user:users!assigned_to(id, name, phone),
          assigned_by_user:users!assigned_by(id, name)
        `)
        .order('created_at', { ascending: true });

      // Filter by assigned dispenser if not showing all tasks
      if (!showAllTasks) {
        query = query.eq('assigned_to', dispenserId);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Transform weekly tasks to the expected interface
      const transformedData = (data || []).map((task, index) => {
        return {
          id: task.id,
          source_type: 'weekly_task' as const,
          display_name: task.title,
          description: task.description,
          assigned_to: task.assigned_to,
          assigned_by: task.assigned_by,
          date_field: task.created_at.split('T')[0], // Use created_at as date
          priority: task.priority,
          status: task.status,
          whatsapp_sent: task.whatsapp_sent,
          whatsapp_sent_at: task.whatsapp_sent_at,
          created_at: task.created_at,
          updated_at: task.updated_at,
          assigned_user_name: task.assigned_user?.name || null,
          assigned_user_phone: task.assigned_user?.phone || null,
          assigned_by_user_name: task.assigned_by_user?.name || null,
          product_name: null,
          quantity: null,
          unit_price: null,
          expiry_date: null,
          branch_id: null,
          branch_name: null,
          risk_level: task.priority === 'urgent' ? 'critical' : 
                     task.priority === 'high' ? 'high' : 
                     task.priority === 'medium' ? 'medium' : 'low'
        };
      });
      
      setAssignedProducts(transformedData);
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
  }, [toast, showAllTasks]);

  // New function to fetch ALL weekly assignments for the current week
  const fetchAllWeeklyAssignments = useCallback(async (month: string, week: string) => {
    setLoading(true);
    try {
      console.log('fetchAllWeeklyAssignments called with month:', month, 'week:', week);
      
      // Fetch ALL weekly tasks for the current week/month
      const { data, error } = await supabase
        .from('weekly_tasks')
        .select(`
          *,
          assigned_user:users!assigned_to(id, name, phone),
          assigned_by_user:users!assigned_by(id, name)
        `)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      console.log('Data fetched from weekly_tasks:', data);
      console.log('Number of tasks fetched:', data?.length || 0);
      
      // Transform weekly tasks to the expected interface
      const transformedData = (data || []).map((task) => {
        return {
          id: task.id,
          source_type: 'weekly_task' as const,
          display_name: task.title,
          description: task.description,
          assigned_to: task.assigned_to,
          assigned_by: task.assigned_by,
          date_field: task.created_at.split('T')[0], // Use created_at as date
          priority: task.priority,
          status: task.status,
          whatsapp_sent: task.whatsapp_sent,
          whatsapp_sent_at: task.whatsapp_sent_at,
          created_at: task.created_at,
          updated_at: task.updated_at,
          assigned_user_name: task.assigned_user?.name || null,
          assigned_user_phone: task.assigned_user?.phone || null,
          assigned_by_user_name: task.assigned_by_user?.name || null,
          product_name: null,
          quantity: null,
          unit_price: null,
          expiry_date: null,
          branch_id: null,
          branch_name: null,
          risk_level: task.priority === 'urgent' ? 'critical' : 
                     task.priority === 'high' ? 'high' : 
                     task.priority === 'medium' ? 'medium' : 'low'
        };
      });
      
      console.log('Transformed data:', transformedData);
      setAssignedProducts(transformedData);
      
    } catch (error: unknown) {
      console.error('Error in fetchAllWeeklyAssignments:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message || "Failed to fetch all weekly assignments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Function to create sample weekly tasks for demonstration
  const createSampleWeeklyTasks = useCallback(async () => {
    if (!hasAdminAccess) {
      toast({ title: 'Access Denied', description: 'Only admins can create sample tasks', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      
      // Sample products for the week
      const sampleProducts = [
        'AMIKACIN 500MG IND INJ',
        'PIMCEF/MEGAPIME 1G INJ',
        'CHLOROCIDE SYRUP',
        'CLOPI-DENK 75MG',
        'TIXYLIX INFANT COUGH SYRUP',
        'PARACETAMOL 500MG',
        'AMOXICILLIN 250MG'
      ];

      // Get all dispensers
      const { data: dispensers, error: dispensersError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'dispenser');

      if (dispensersError) throw dispensersError;

      // Create 7 tasks for each dispenser (7 × 6 = 42 total)
      const tasksToCreate = [];
      for (const dispenser of dispensers || []) {
        for (let i = 0; i < 7; i++) {
          const product = sampleProducts[i];
          const priority = i < 2 ? 'high' : i < 4 ? 'medium' : 'low';
          
          tasksToCreate.push({
            title: `Move ${product}`,
            description: `Move ${product} (Risk: ${priority}, Expiry: 2025-12-31)`,
            assigned_to: dispenser.id,
            assigned_by: user?.id,
            priority: priority,
            status: 'pending',
            whatsapp_sent: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      // Insert all tasks
      const { error: insertError } = await supabase
        .from('weekly_tasks')
        .insert(tasksToCreate);

      if (insertError) throw insertError;

      toast({ 
        title: 'Sample Weekly Tasks Created', 
        description: `Created ${tasksToCreate.length} sample tasks for ${dispensers?.length || 0} dispensers` 
      });

      // Refresh the list
      await fetchAllWeeklyAssignments(selectedMonth, selectedWeek);
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message || "Failed to create sample weekly tasks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, user, selectedMonth, selectedWeek, fetchAllWeeklyAssignments, toast]);

  // Function to ensure each dispenser has exactly 7 products for the week
  const ensureWeeklyProductStructure = useCallback(async () => {
    if (!hasAdminAccess) {
      toast({ title: 'Access Denied', description: 'Only admins can create weekly product structure', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      
      // Define exactly 7 products for the week (like in your Excel example)
      const weeklyProducts = [
        'NEC',
        'SEN', 
        'MO',
        'NUC',
        'RISF',
        'IRBI',
        'CAR'
      ];

      // Clear existing weekly tasks for this week to start fresh
      const currentWeekStart = new Date();
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay()); // Start of week (Sunday)
      
      const { error: deleteError } = await supabase
        .from('weekly_tasks')
        .delete()
        .gte('created_at', currentWeekStart.toISOString());

      if (deleteError) throw deleteError;

      // Get all dispensers
      const { data: dispensers, error: dispensersError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'dispenser');

      if (dispensersError) throw dispensersError;

      // Debug: Log what we found
      console.log('Found dispensers:', dispensers);
      console.log('Number of dispensers:', dispensers?.length || 0);

      // Create exactly 7 tasks for each dispenser (7 × 6 = 42 total)
      const tasksToCreate = [];

      // If no dispensers found in users table, try user_roles table
      if (!dispensers || dispensers.length === 0) {
        console.log('No dispensers found in users table, checking user_roles table...');
        
        const { data: userRoles, error: userRolesError } = await supabase
          .from('user_roles')
          .select(`
            user_id,
            users!inner(id, name, email)
          `)
          .eq('role', 'dispenser');

        if (userRolesError) throw userRolesError;
        
        console.log('Found dispensers in user_roles:', userRoles);
        
        if (userRoles && userRoles.length > 0) {
          // Transform the data to match expected format
          const transformedDispensers = userRoles.map(ur => ({
            id: ur.users.id,
            name: ur.users.name,
            email: ur.users.email
          }));
          
          console.log('Transformed dispensers:', transformedDispensers);
          
          // Use transformed dispensers
          for (const dispenser of transformedDispensers) {
            // Each dispenser gets exactly 7 products for the week
            for (let i = 0; i < 7; i++) {
              const product = weeklyProducts[i];
              const priority = i < 2 ? 'high' : i < 4 ? 'medium' : 'low';
              
              tasksToCreate.push({
                title: `Move ${product}`,
                description: `Move ${product} (Priority: ${priority}, Week: ${selectedWeek}, Month: ${selectedMonth})`,
                assigned_to: dispenser.id,
                assigned_by: user?.id,
                priority: priority,
                status: 'pending',
                whatsapp_sent: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
          }
        } else {
          throw new Error('No dispensers found in either users table or user_roles table');
        }
      } else {
        // Use dispensers from users table
        for (const dispenser of dispensers) {
          // Each dispenser gets exactly 7 products for the week
          for (let i = 0; i < 7; i++) {
            const product = weeklyProducts[i];
            const priority = i < 2 ? 'high' : i < 4 ? 'medium' : 'low';
            
            tasksToCreate.push({
              title: `Move ${product}`,
              description: `Move ${product} (Priority: ${priority}, Week: ${selectedWeek}, Month: ${selectedMonth})`,
              assigned_to: dispenser.id,
              assigned_by: user?.id,
              priority: priority,
              status: 'pending',
              whatsapp_sent: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        }
      }

      // Insert exactly 42 tasks (7 products × 6 dispensers)
      const { error: insertError } = await supabase
        .from('weekly_tasks')
        .insert(tasksToCreate);

      if (insertError) throw insertError;

      toast({ 
        title: 'Weekly Product Structure Created!', 
        description: `Created exactly ${tasksToCreate.length} tasks: 7 products × ${tasksToCreate.length / 7} dispensers = Perfect weekly structure!` 
      });

      // Refresh the data
      await fetchAllWeeklyAssignments(selectedMonth, selectedWeek);

    } catch (error: unknown) {
      console.error('Error in ensureWeeklyProductStructure:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message || "Failed to create weekly product structure",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, selectedWeek, selectedMonth, user?.id, toast, fetchAllWeeklyAssignments]);

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
    if (!title || !selectedDispenser) {
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
      // Better error message extraction
      let errorMessage = "Failed to create task"
      
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
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  // New function to download ONLY weekly tasks (42 per week)
  const handleDownloadWeeklyTasksOnly = async () => {
    try {
      setLoading(true);
      
      // Fetch ONLY weekly tasks for the current week/month
      const { data, error } = await supabase
        .from('weekly_tasks')
        .select(`
          *,
          assigned_user:users!assigned_to(id, name, phone),
          assigned_by_user:users!assigned_by(id, name)
        `)
        .eq('status', 'pending') // Only pending tasks for the week
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({ title: 'No weekly tasks found', variant: 'destructive' });
        return;
      }

      // Enhanced headers for weekly tasks only
      const headers = [
        'Week', 
        'Month', 
        'Dispenser Name', 
        'Dispenser Contact', 
        'Day of Week', 
        'Task Title', 
        'Description', 
        'Priority', 
        'Status', 
        'Created Date'
      ];

      // Create data for weekly tasks only
      const csvData = data.map(task => [
        selectedWeek,
        selectedMonth,
        task.assigned_user?.name || 'Unknown',
        task.assigned_user?.phone || 'No phone',
        new Date(task.created_at).toLocaleDateString('en-US', { weekday: 'long' }),
        task.title,
        task.description || '',
        task.priority,
        task.status,
        new Date(task.created_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        })
      ]);

      // Sort by dispenser name, then by day of week
      csvData.sort((a, b) => {
        const dispenserA = a[2];
        const dispenserB = b[2];
        if (dispenserA !== dispenserB) {
          return dispenserA.localeCompare(dispenserB);
        }
        
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayA = a[4];
        const dayB = b[4];
        return dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
      });

      // Add a summary row at the top
      const summaryRow = [
        `Week ${selectedWeek} Weekly Tasks Only`,
        selectedMonth,
        `Total Weekly Tasks: ${data.length}`,
        `Target: 42 (7 products × 6 dispensers)`,
        '',
        '',
        '',
        '',
        '',
        ''
      ];

      const csvContent = [headers, summaryRow, ...csvData].map(row => 
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `weekly-tasks-only-week-${selectedWeek}-${selectedMonth}-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ 
        title: 'Weekly Tasks Only Downloaded', 
        description: `CSV file with ${data.length} weekly tasks for Week ${selectedWeek}` 
      });
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: message || "Failed to download weekly tasks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to download all dispenser tasks with exactly 7 per dispenser
  const handleDownload7ProductsPerWeek = useCallback(async () => {
    if (!hasAdminAccess) {
      toast({ title: 'Access Denied', description: 'You need admin access to download all dispenser tasks', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);

      // Fetch all tasks with user information
      const { data: tasks, error } = await supabase
        .from('weekly_tasks')
        .select(`
          *,
          assigned_user:users!assigned_to(id, name, phone),
          assigned_by_user:users!assigned_by(id, name)
        `);

      if (error) throw error;

      // Get stock items to match with tasks for quantities and expiry dates
      const { data: stockItems, error: stockError } = await supabase
        .from('stock_items')
        .select('id, product_name, quantity, expiry_date');

      if (stockError) throw stockError;

      // Create maps for efficient product name matching
      const quantityMap = new Map<string, number>();
      const expiryMap = new Map<string, string>();

      stockItems?.forEach(item => {
        quantityMap.set(item.product_name.toLowerCase(), item.quantity);
        expiryMap.set(item.product_name.toLowerCase(), item.expiry_date);
      });

      // Helper function to extract quantity and expiry from task title/description
      const getQuantityFromTask = (task: any, quantityMap: Map<string, number>, expiryMap: Map<string, string>) => {
        const searchText = (task.title + ' ' + (task.description || '')).toLowerCase();
        
        // Look for exact product name matches
        for (const [productName, quantity] of quantityMap.entries()) {
          if (searchText.includes(productName)) {
            const expiry = expiryMap.get(productName);
            return {
              quantity: quantity.toString(),
              expiry: expiry ? format(new Date(expiry), 'yyyy-MM-dd') : ''
            };
          }
        }
        
        // If no match found, return default
        return {
          quantity: '1',
          expiry: ''
        };
      };

      // Group tasks by dispenser and limit to 7 per dispenser
      const dispenserTasks: { [key: string]: any[] } = {};

      tasks?.forEach((task: any) => {
        const dispenserName = task.assigned_user?.name || 'Unknown';
        if (!dispenserTasks[dispenserName]) {
          dispenserTasks[dispenserName] = [];
        }
        // Only add if we haven't reached 7 tasks for this dispenser
        if (dispenserTasks[dispenserName].length < 7) {
          // Add quantity and expiry information to the task
          const taskWithQuantity = {
            ...task,
            ...getQuantityFromTask(task, quantityMap, expiryMap)
          };
          dispenserTasks[dispenserName].push(taskWithQuantity);
        }
      });

      // Prepare CSV data
      const headers = [
        'Title',
        'Description',
        'Quantity',
        'Expiry Date',
        'Created At'
      ];

      // Create CSV data with exactly 7 tasks per dispenser
      const csvData = [];
      const sortedDispensers = Object.keys(dispenserTasks).sort();

      sortedDispensers.forEach(dispenserName => {
        // Add dispenser header
        csvData.push(['', `=== ${dispenserName} ===`, '', '', '']);
        
        // Add exactly 7 tasks for this dispenser (pad with empty rows if needed)
        const dispenserTaskList = dispenserTasks[dispenserName];
        for (let i = 0; i < 7; i++) {
          if (i < dispenserTaskList.length) {
            const task = dispenserTaskList[i];
            csvData.push([
              task.title,
              task.description || '',
              task.quantity || '1', // Actual quantity from stock_items
              task.expiry || '', // Expiry date from stock_items
              format(new Date(task.created_at), 'yyyy-MM-dd HH:mm')
            ]);
          } else {
            // Add empty row to maintain 7 rows per dispenser
            csvData.push(['', '', '', '', '']);
          }
        }
        
        // Add empty row after dispenser's tasks
        csvData.push(['', '', '', '', '']);
      });

      // Create and download CSV
      const csvContent = [headers, ...csvData].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `all-dispenser-tasks-7-per-dispenser.csv`;
      link.click();
      URL.revokeObjectURL(url);

      // Success message
      const totalTasks = Object.values(dispenserTasks).reduce((sum, tasks) => sum + tasks.length, 0);
      toast({ 
        title: 'Download Successful', 
        description: `Downloaded ${totalTasks} tasks for ${sortedDispensers.length} dispensers (7 per dispenser)` 
      });

    } catch (error: any) {
      console.error('Download error:', error);
      toast({ 
        title: 'Download Failed', 
        description: error?.message || error?.toString() || 'Failed to download tasks', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, toast]);

  // Function to download all assignments for a specific dispenser
  const handleDownloadDispenserAssignments = useCallback(async (dispenserId?: string) => {
    if (!hasAdminAccess) {
      toast({ title: 'Access Denied', description: 'You need admin access to download dispenser assignments', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);

      // Get the dispenser to download (either selected or all)
      let targetDispenserId = dispenserId;
      if (!targetDispenserId && selectedDispenser) {
        targetDispenserId = selectedDispenser;
      }

      // Fetch all tasks for the specific dispenser
      const { data: tasks, error } = await supabase
        .from('weekly_tasks')
        .select(`
          *,
          assigned_user:users!assigned_to(id, name, phone),
          assigned_by_user:users!assigned_by(id, name)
        `)
        .eq('assigned_to', targetDispenserId || '')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!tasks || tasks.length === 0) {
        toast({ title: 'No tasks found', description: 'This dispenser has no assignments', variant: 'destructive' });
        return;
      }

      // Get stock items for quantities and expiry dates
      const { data: stockItems, error: stockError } = await supabase
        .from('stock_items')
        .select('id, product_name, quantity, expiry_date');

      if (stockError) throw stockError;

      // Create maps for product matching
      const quantityMap = new Map<string, number>();
      const expiryMap = new Map<string, string>();

      stockItems?.forEach(item => {
        quantityMap.set(item.product_name.toLowerCase(), item.quantity);
        expiryMap.set(item.product_name.toLowerCase(), item.expiry_date);
      });

      // Helper function to get quantity and expiry
      const getQuantityFromTask = (task: any) => {
        const searchText = (task.title + ' ' + (task.description || '')).toLowerCase();
        
        for (const [productName, quantity] of quantityMap.entries()) {
          if (searchText.includes(productName)) {
            const expiry = expiryMap.get(productName);
            return {
              quantity: quantity.toString(),
              expiry: expiry ? format(new Date(expiry), 'yyyy-MM-dd') : ''
            };
          }
        }
        
        return { quantity: '1', expiry: '' };
      };

      // Prepare CSV data
      const headers = ['Title', 'Description', 'Quantity', 'Expiry Date', 'Priority', 'Status', 'Created At'];
      const csvData = [];

      // Add dispenser header
      const dispenserName = tasks[0]?.assigned_user?.name || 'Unknown';
      csvData.push(['', `=== ${dispenserName} - All Assignments ===`, '', '', '', '', '']);

      // Add all tasks for this dispenser
      tasks.forEach(task => {
        const { quantity, expiry } = getQuantityFromTask(task);
        csvData.push([
          task.title,
          task.description || '',
          quantity,
          expiry,
          task.priority,
          task.status,
          format(new Date(task.created_at), 'yyyy-MM-dd HH:mm')
        ]);
      });

      // Add summary
      csvData.push(['', '', '', '', '', '', '']);
      csvData.push(['', `Total Assignments: ${tasks.length}`, '', '', '', '', '']);
      csvData.push(['', `Dispenser: ${dispenserName}`, '', '', '', '', '']);
      csvData.push(['', `Downloaded: ${new Date().toLocaleDateString()}`, '', '', '', '', '']);

      // Create and download CSV
      const csvContent = [headers, ...csvData].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dispenserName}-all-assignments.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ 
        title: 'Dispenser Assignments Downloaded', 
        description: `Downloaded ${tasks.length} tasks for ${dispenserName}` 
      });

    } catch (error: any) {
      console.error('Download error:', error);
      toast({ 
        title: 'Download Failed', 
        description: error?.message || error?.toString() || 'Failed to download dispenser assignments', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, selectedDispenser, toast]);

  const handleOpenAdjust = (item: UnifiedAssignment) => {
    setAdjustItem({
      id: item.id,
      source_type: item.source_type,
      display_name: item.display_name,
      quantity: item.quantity || 0,
      branch_id: item.branch_id || undefined,
      assigned_to: item.assigned_to || undefined,
      product_name: item.product_name || undefined,
      branch: item.branch_name || undefined
    })
    setAdjustQty(1)
    setAdjustDialogOpen(true)
  }

  const handleAdjustSubmit = async () => {
    if (!adjustItem) return
    setAdjustLoading(true)
    try {
      if (adjustItem.source_type === 'weekly_task') {
        // For weekly tasks, we need to find the corresponding stock item
        // Extract product name from task title (assuming format: "Move PRODUCT_NAME")
        const productName = adjustItem.display_name.replace('Move ', '')
        
        // Find the stock item by product name
        const { data: stockItems, error: findError } = await supabase
          .from('stock_items')
          .select('*')
          .ilike('product_name', `%${productName}%`)
          .limit(1)
        
        if (findError) throw findError
        
        if (!stockItems || stockItems.length === 0) {
          toast({ 
            title: 'Error', 
            description: `No stock item found for product: ${productName}`, 
            variant: 'destructive' 
          })
          return
        }
        
        const stockItem = stockItems[0]
        if (adjustQty < 1 || adjustQty > stockItem.quantity) {
          toast({ 
            title: 'Error', 
            description: `Invalid quantity. Available: ${stockItem.quantity}`, 
            variant: 'destructive' 
          })
          return
        }
        
        const newQty = stockItem.quantity - adjustQty
        const updateObj: { quantity: number; status?: string } = { quantity: newQty }
        if (newQty === 0) updateObj.status = 'out_of_stock'
        
        const { error: updateError } = await supabase
          .from('stock_items')
          .update(updateObj)
          .eq('id', stockItem.id)
        if (updateError) throw updateError
        
        // Record movement
        const { data: { user } } = await supabase.auth.getUser()
        const movementData = {
          stock_item_id: stockItem.id,
          movement_type: 'adjustment',
          quantity_moved: adjustQty,
          from_branch_id: stockItem.branch_id || null,
          to_branch_id: null, // No transfer, just adjustment
          for_dispenser: adjustItem.assigned_to || null,
          moved_by: user?.id || null,
          movement_date: new Date().toISOString(),
          notes: `Quantity adjusted from task: ${adjustItem.display_name}. Task ID: ${adjustItem.id}`
        }

        const { error: historyError } = await supabase
          .from('stock_movement_history')
          .insert(movementData)

        if (historyError) {
          console.error('Movement history error:', historyError)
          toast({ 
            title: 'Partial Success', 
            description: `Stock updated but movement history failed. New quantity: ${newQty}` 
          })
        } else {
          toast({ title: 'Success', description: `Quantity adjusted. New quantity: ${newQty}. Movement recorded.` })
        }
      } else {
        // For assigned products, use the existing logic
        if (adjustQty < 1 || adjustQty > adjustItem.quantity) return
        const newQty = adjustItem.quantity - adjustQty
        const updateObj: { quantity: number; status?: string } = { quantity: newQty }
        if (newQty === 0) updateObj.status = 'out_of_stock'
        
        const { error: updateError } = await supabase
          .from('stock_items')
          .update(updateObj)
          .eq('id', adjustItem.id)
        if (updateError) throw updateError
        
        // Record movement
        const { data: { user } } = await supabase.auth.getUser()
        const movementData = {
          stock_item_id: adjustItem.id,
          movement_type: 'adjustment',
          quantity_moved: adjustQty,
          from_branch_id: adjustItem.branch_id || null,
          to_branch_id: null, // No transfer, just adjustment
          for_dispenser: adjustItem.assigned_to || null,
          moved_by: user?.id || null,
          movement_date: new Date().toISOString(),
          notes: `Quantity adjusted by dispenser from assigned product. Product: ${adjustItem.product_name}`
        }

        const { error: historyError } = await supabase
          .from('stock_movement_history')
          .insert(movementData)

        if (historyError) {
          console.error('Movement history error:', historyError)
          toast({ 
            title: 'Partial Success', 
            description: `Stock updated but movement history failed. New quantity: ${newQty}` 
          })
        } else {
          toast({ title: 'Success', description: `Quantity adjusted. New quantity: ${newQty}. Movement recorded.` })
        }
      }

      setAdjustDialogOpen(false)
      setAdjustItem(null)
      setAdjustQty(1)
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to adjust quantity"
      
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
      
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' })
    } finally {
      setAdjustLoading(false)
    }
  }

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
           <h1 className="text-3xl font-bold text-white mb-2">Dispenser Tasks</h1>
           <p className="text-slate-400">
             {showAllTasks 
               ? `Viewing all tasks (${assignedProducts.length} total)` 
               : `Viewing tasks assigned to selected dispenser (${assignedProducts.length} tasks)`
             }
           </p>
         </div>
      </div>
      
      <div className="p-6 max-w-5xl mx-auto">
        {/* View Toggle */}
        <div className="flex items-center border-b border-slate-700 mb-6">
          <button 
            onClick={() => setActiveView('tasks')} 
            className={`px-4 py-2 text-sm font-medium ${activeView === 'tasks' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-400'}`}
          >
            Tasks
          </button>
          <button 
            onClick={() => setActiveView('search')} 
            className={`px-4 py-2 text-sm font-medium ${activeView === 'search' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-400'}`}
          >
            Product Search
          </button>
        </div>

        {activeView === 'tasks' && (
          <>
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
                       disabled={!title || !selectedDispenser}
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
              <label className="block mb-1 text-slate-300 text-sm font-medium">View</label>
              <Select value={showAllTasks ? "all" : "my"} onValueChange={(value) => setShowAllTasks(value === "all")}>
                <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select view" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="my">My Tasks</SelectItem>
                  <SelectItem value="all">All Tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          {hasAdminAccess && (
            <Button 
              onClick={handleDownload7ProductsPerWeek} 
              variant="outline" 
              className="h-10 border-teal-600 text-teal-400 hover:bg-teal-600 hover:text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download 7 Products Per Week
            </Button>
          )}
          {hasAdminAccess && (
            <Button 
              onClick={() => handleDownloadDispenserAssignments(selectedDispenser)} 
              variant="outline" 
              className="h-10 border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Selected Dispenser Assignments
            </Button>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Dispenser Product Count Summary */}
        {!loading && assignedProducts.length > 0 && showAllTasks && (
          <Card className="bg-slate-800 border-slate-700 mb-4">
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-white mb-3">📊 Weekly Product Distribution</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {(() => {
                  const groupedByDispenser = assignedProducts.reduce((groups, task) => {
                    const dispenserName = task.assigned_user_name || 'Unknown';
                    if (!groups[dispenserName]) {
                      groups[dispenserName] = [];
                    }
                    groups[dispenserName].push(task);
                    return groups;
                  }, {} as Record<string, typeof assignedProducts>);

                  return Object.entries(groupedByDispenser).map(([dispenserName, tasks]) => {
                    const productCount = tasks.length;
                    const isComplete = productCount === 7;
                    return (
                      <div key={dispenserName} className="text-center p-3 rounded-lg border">
                        <div className={`text-2xl font-bold ${isComplete ? 'text-green-400' : 'text-orange-400'}`}>
                          {productCount}/7
                        </div>
                        <div className="text-sm text-slate-300">{dispenserName}</div>
                        <div className={`text-xs ${isComplete ? 'text-green-400' : 'text-orange-400'}`}>
                          {isComplete ? '✅ Complete' : '❌ Incomplete'}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="mt-3 text-sm text-slate-400 text-center">
                Target: 42 total products (7 per dispenser × 6 dispensers)
              </div>
            </CardContent>
          </Card>
        )}

                          {/* Display Logic */}
         {!loading && (
           <div className="space-y-4">
             {assignedProducts.length === 0 ? (
               <Card className="bg-slate-800 border-slate-700">
                 <CardContent className="py-8 text-center text-slate-400">
                   {showAllTasks ? 'No tasks found.' : 'No tasks assigned to this dispenser.'}
                 </CardContent>
               </Card>
             ) : showAllTasks ? (
               // All Tasks View - List format
               <div className="space-y-3">
                 {assignedProducts.map((task, index) => {
                   return (
                     <Card key={task.id} className="bg-slate-800 border-slate-700">
                       <CardContent className="p-4">
                         <div className="flex justify-between items-start">
                           <div className="flex-1">
                             <div className="text-lg font-semibold text-white mb-2">
                               {task.display_name}
                             </div>
                             <div className="text-sm text-slate-300 space-y-1">
                               <div>📝 {task.description || 'No description'}</div>
                               <div>👤 Assigned to: {task.assigned_user_name || 'Unknown'}</div>
                               <div>📅 Created: {format(new Date(task.created_at), 'MMM dd, yyyy')}</div>
                               <div>🎯 Priority: {task.priority} | Risk: {task.risk_level}</div>
                             </div>
                           </div>
                           <div className="flex items-center gap-3">
                             <Badge 
                               variant={
                                 task.status === 'completed' ? 'default' : 
                                 task.status === 'in_progress' ? 'secondary' : 'outline'
                               }
                               className={
                                 task.risk_level === 'critical' ? 'bg-red-500' :
                                 task.risk_level === 'high' ? 'bg-orange-500' :
                                 task.risk_level === 'medium' ? 'bg-yellow-500' :
                                 'bg-green-500'
                               }
                             >
                               {task.status}
                             </Badge>
                             <Select value={task.status} onValueChange={(status) => updateTaskStatus(task.id, status)}>
                               <SelectTrigger className="w-32 h-8 bg-slate-600 border-slate-500 text-white">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent className="bg-slate-700 border-slate-600">
                                 <SelectItem value="pending">Pending</SelectItem>
                                 <SelectItem value="in_progress">In Progress</SelectItem>
                                 <SelectItem value="completed">Completed</SelectItem>
                               </SelectContent>
                             </Select>
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               onClick={() => handleOpenAdjust(task)}
                               className="text-blue-400 hover:text-blue-300"
                             >
                               Adjust Qty
                             </Button>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                   );
                 })}
               </div>
             ) : (
               // My Tasks View - Weekly format
               <div className="space-y-3">
                 {[1, 2, 3, 4, 5, 6, 7].map(dayNum => {
                   // Calculate the actual date for this day in the selected week
                   const year = parseInt(selectedMonth.split('-')[0]);
                   const monthNum = parseInt(selectedMonth.split('-')[1]) - 1;
                   const weekNum = parseInt(selectedWeek);
                   const weekStartDay = (weekNum - 1) * 7 + 1;
                   const dayDate = new Date(Date.UTC(year, monthNum, weekStartDay + dayNum - 1));
                   const dayDateString = dayDate.toISOString().split('T')[0];
                   
                   // Find tasks assigned to this specific day (using index for distribution)
                   const dayAssignments = assignedProducts.filter((task, index) => {
                     return index % 7 === (dayNum - 1); // Distribute tasks across 7 days
                   });
                   
                   const assignment = dayAssignments[0]; // Take the first task for this day
                   
                   return (
                     <Card key={dayNum} className="bg-slate-800 border-slate-700">
                       <CardContent className="p-4">
                         <div className="flex justify-between items-center">
                           <div className="flex-1">
                             <div className="text-lg font-semibold text-white mb-1">
                               {dayDate.toLocaleDateString('en-US', { weekday: 'long' })} ({dayDateString}): {assignment ? assignment.display_name : 'No assignment'}
                             </div>
                             {assignment && (
                               <div className="text-sm text-slate-300 space-y-1">
                                 <div>📝 {assignment.description || 'No description'}</div>
                                 <div>👤 Assigned to: {assignment.assigned_user_name || 'Unknown'}</div>
                                 <div>📅 Created: {format(new Date(assignment.created_at), 'MMM dd, yyyy')}</div>
                                 <div>🎯 Priority: {assignment.priority} | Risk: {assignment.risk_level}</div>
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
                                   className={
                                     assignment.risk_level === 'critical' ? 'bg-red-500' :
                                     assignment.risk_level === 'high' ? 'bg-orange-500' :
                                     assignment.risk_level === 'medium' ? 'bg-yellow-500' :
                                     'bg-green-500'
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
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   onClick={() => handleOpenAdjust(assignment)}
                                   className="text-blue-400 hover:text-blue-300"
                                 >
                                   Adjust Qty
                                 </Button>
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
         </>
       )}

               {activeView === 'search' && (
          <ProductSearch />
        )}

        {/* Adjust Quantity Dialog */}
        <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">Adjust Quantity</DialogTitle>
            </DialogHeader>
            {adjustItem && (
              <div className="space-y-4">
                <div>
                  <div className="font-semibold text-white">Task:</div>
                  <div className="text-slate-300">{adjustItem.display_name}</div>
                  {adjustItem.source_type === 'weekly_task' ? (
                    <div className="text-slate-400 text-sm mt-1">
                      This will adjust the stock quantity for the product mentioned in this task.
                    </div>
                  ) : (
                    <>
                      <div className="font-semibold text-white mt-2">Product:</div>
                      <div className="text-slate-300">{adjustItem.product_name}</div>
                      <div className="font-semibold text-white mt-2">Current Quantity:</div>
                      <div className="text-lg font-bold text-white">{adjustItem.quantity} units</div>
                    </>
                  )}
                </div>
                <div>
                  <Label htmlFor="adjust-qty" className="text-slate-300">Quantity to adjust</Label>
                  <Input
                    id="adjust-qty"
                    type="number"
                    min={1}
                    value={adjustQty}
                    onChange={e => setAdjustQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 bg-slate-700 border-slate-600 text-white"
                    disabled={adjustLoading}
                    placeholder="Enter quantity"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={handleAdjustSubmit} 
                    disabled={adjustLoading || adjustQty < 1} 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {adjustLoading ? 'Processing...' : 'Confirm Adjustment'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setAdjustDialogOpen(false)} 
                    disabled={adjustLoading}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default DispenserTasks