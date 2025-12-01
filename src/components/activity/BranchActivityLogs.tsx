import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Activity, 
  Filter, 
  Download,
  Search,
  Clock,
  User,
  Package,
  ClipboardList,
  Settings,
  AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { useUserRole } from '@/hooks/useUserRole'

interface ActivityLog {
  id: string
  branch_id: string
  user_id: string | null
  activity_type: string
  activity_category: string
  action: string
  entity_type: string | null
  entity_id: string | null
  description: string
  metadata: Record<string, any>
  created_at: string
  user?: {
    email: string
  } | null
}

const BranchActivityLogs: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager } = useBranch()
  const { hasAdminAccess } = useUserRole()
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  const canViewLogs = hasAdminAccess || isSystemAdmin || isRegionalManager

  useEffect(() => {
    if (selectedBranch && canViewLogs) {
      fetchLogs()
    }
  }, [selectedBranch, canViewLogs])

  useEffect(() => {
    filterLogs()
  }, [logs, searchTerm, categoryFilter, typeFilter, dateRange])

  const fetchLogs = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
      let query = supabase
        .from('branch_activity_logs')
        .select(`
          *,
          user:user_id (
            email
          )
        `)
        .eq('branch_id', selectedBranch.id)
        .order('created_at', { ascending: false })
        .limit(1000)

      const { data, error } = await query

      if (error) throw error

      // Transform user data
      const transformedLogs = (data || []).map((log: any) => ({
        ...log,
        user: log.user && typeof log.user === 'object' && 'email' in log.user 
          ? { email: log.user.email as string } 
          : null
      }))

      setLogs(transformedLogs)
    } catch (error: any) {
      console.error('Error fetching activity logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterLogs = () => {
    let filtered = [...logs]

    // Date range filter
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      filtered = filtered.filter(log => new Date(log.created_at) >= cutoffDate)
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(log => log.activity_category === categoryFilter)
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(log => log.activity_type === typeFilter)
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(log =>
        log.description.toLowerCase().includes(term) ||
        log.user?.email?.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.entity_type?.toLowerCase().includes(term)
      )
    }

    setFilteredLogs(filtered)
  }

  const getActivityIcon = (category: string) => {
    switch (category) {
      case 'stock':
        return <Package className="h-4 w-4" />
      case 'assignment':
        return <ClipboardList className="h-4 w-4" />
      case 'user':
        return <User className="h-4 w-4" />
      case 'settings':
        return <Settings className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getActivityBadgeVariant = (action: string) => {
    switch (action) {
      case 'create':
        return 'default'
      case 'update':
        return 'secondary'
      case 'delete':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const exportToCSV = () => {
    const headers = [
      'Date',
      'Time',
      'User',
      'Category',
      'Type',
      'Action',
      'Description',
      'Entity Type',
      'Entity ID'
    ]

    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'yyyy-MM-dd'),
      format(new Date(log.created_at), 'HH:mm:ss'),
      log.user?.email || 'System',
      log.activity_category,
      log.activity_type,
      log.action,
      log.description,
      log.entity_type || 'N/A',
      log.entity_id || 'N/A'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', `branch_activity_logs_${selectedBranch?.code}_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(logs.map(log => log.activity_category))).sort()
  }, [logs])

  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(logs.map(log => log.activity_type))).sort()
  }, [logs])

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to view activity logs.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!canViewLogs) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to view activity logs.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6" />
            Activity Logs
          </CardTitle>
          <CardDescription>
            Audit trail for {selectedBranch.name} ({selectedBranch.code})
          </CardDescription>
        </div>
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {uniqueTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Total: {filteredLogs.length} logs</span>
            {filteredLogs.length !== logs.length && (
              <span>(Filtered from {logs.length} total)</span>
            )}
          </div>

          {/* Logs Table */}
          {loading ? (
            <div className="text-center p-8">Loading...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              No activity logs found
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {format(new Date(log.created_at), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), 'HH:mm:ss')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {log.user?.email || 'System'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActivityIcon(log.activity_category)}
                          <Badge variant="outline">{log.activity_category}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{log.activity_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActivityBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <span className="text-sm">{log.description}</span>
                      </TableCell>
                      <TableCell>
                        {log.entity_type ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">{log.entity_type}</span>
                            {log.entity_id && (
                              <span className="text-xs text-muted-foreground">
                                {log.entity_id.substring(0, 8)}...
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default BranchActivityLogs

