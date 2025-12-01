import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  MessageSquare, 
  RefreshCw,
  Filter,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  RotateCw
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { useUserRole } from '@/hooks/useUserRole'

interface WhatsAppQueueNotification {
  id: string
  user_id: string
  branch_id: string
  recipient_phone: string
  message_content: string
  message_type: string
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  twilio_sid: string | null
  error_message: string | null
  retry_count: number
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, any>
  related_id: string | null
  related_type: string | null
}

const WhatsAppHistory: React.FC = () => {
  const { selectedBranch } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess, userRole } = useUserRole()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<WhatsAppQueueNotification[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<WhatsAppQueueNotification[]>([])
  const [selectedNotification, setSelectedNotification] = useState<WhatsAppQueueNotification | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)

  useEffect(() => {
    if (selectedBranch) {
      fetchNotifications()
    }
  }, [selectedBranch, user])

  useEffect(() => {
    filterNotifications()
  }, [notifications, statusFilter, typeFilter, searchTerm])

  const fetchNotifications = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
      let query = supabase
        .from('whatsapp_notification_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      // Filter by branch
      query = query.eq('branch_id', selectedBranch.id)

      // If not system admin, only show user's own notifications
      if (!hasAdminAccess && user) {
        query = query.eq('user_id', user.id)
      }

      const { data, error } = await query

      if (error) throw error

      setNotifications(data || [])
    } catch (error: any) {
      console.error('Error fetching WhatsApp notifications:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch WhatsApp notifications',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const filterNotifications = () => {
    let filtered = [...notifications]

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(n => n.status === statusFilter)
    }

    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(n => n.message_type === typeFilter)
    }

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(n => 
        n.message_content.toLowerCase().includes(searchLower) ||
        n.recipient_phone.includes(searchTerm) ||
        n.message_type.toLowerCase().includes(searchLower)
      )
    }

    setFilteredNotifications(filtered)
  }

  const retryNotification = async (notificationId: string) => {
    setRetrying(notificationId)
    try {
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          notification_id: notificationId
        }
      })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Notification retry initiated'
      })

      // Refresh after a short delay
      setTimeout(() => {
        fetchNotifications()
      }, 2000)
    } catch (error: any) {
      console.error('Error retrying notification:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to retry notification',
        variant: 'destructive'
      })
    } finally {
      setRetrying(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge variant="default" className="bg-blue-500"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>
      case 'delivered':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Delivered</Badge>
      case 'read':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Read</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'emergency_assignment': 'Emergency Assignment',
      'expiry_warning': 'Expiry Warning',
      'deadline_reminder': 'Deadline Reminder',
      'low_stock_alert': 'Low Stock Alert',
      'assignment_completed': 'Assignment Completed',
      'assignment_cancelled': 'Assignment Cancelled',
      'ai_recommendation': 'AI Recommendation',
      'system_alert': 'System Alert',
      'custom': 'Custom'
    }
    return labels[type] || type
  }

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Notification History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to view WhatsApp notification history.
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
            <MessageSquare className="h-6 w-6" />
            WhatsApp Notification History
          </CardTitle>
          <CardDescription>
            View and manage WhatsApp notifications for {selectedBranch.name} ({selectedBranch.code})
          </CardDescription>
        </div>
        <Button onClick={fetchNotifications} disabled={loading} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search messages, phone numbers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="min-w-[150px]">
            <Label htmlFor="status-filter">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[150px]">
            <Label htmlFor="type-filter">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="emergency_assignment">Emergency Assignment</SelectItem>
                <SelectItem value="expiry_warning">Expiry Warning</SelectItem>
                <SelectItem value="deadline_reminder">Deadline Reminder</SelectItem>
                <SelectItem value="low_stock_alert">Low Stock Alert</SelectItem>
                <SelectItem value="assignment_completed">Assignment Completed</SelectItem>
                <SelectItem value="assignment_cancelled">Assignment Cancelled</SelectItem>
                <SelectItem value="ai_recommendation">AI Recommendation</SelectItem>
                <SelectItem value="system_alert">System Alert</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">
              {notifications.filter(n => n.status === 'pending').length}
            </div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground">Sent</div>
            <div className="text-2xl font-bold text-blue-600">
              {notifications.filter(n => n.status === 'sent').length}
            </div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground">Delivered</div>
            <div className="text-2xl font-bold text-green-600">
              {notifications.filter(n => n.status === 'delivered' || n.status === 'read').length}
            </div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground">Failed</div>
            <div className="text-2xl font-bold text-red-600">
              {notifications.filter(n => n.status === 'failed').length}
            </div>
          </div>
        </div>

        {/* Notifications Table */}
        {loading ? (
          <div className="text-center p-8">Loading notifications...</div>
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            No notifications found matching your filters.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Message Preview</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>{getStatusBadge(notification.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(notification.message_type)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{notification.recipient_phone}</TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate text-sm">
                        {notification.message_content.substring(0, 60)}
                        {notification.message_content.length > 60 ? '...' : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(notification.created_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedNotification(notification)
                            setShowDetailsDialog(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {notification.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => retryNotification(notification.id)}
                            disabled={retrying === notification.id}
                          >
                            <RotateCw className={`h-4 w-4 ${retrying === notification.id ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notification Details</DialogTitle>
            <DialogDescription>
              Complete information about this WhatsApp notification
            </DialogDescription>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">Status</Label>
                  <div>{getStatusBadge(selectedNotification.status)}</div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Type</Label>
                  <div><Badge variant="outline">{getTypeLabel(selectedNotification.message_type)}</Badge></div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Recipient</Label>
                  <div className="font-mono text-sm">{selectedNotification.recipient_phone}</div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Retry Count</Label>
                  <div>{selectedNotification.retry_count}</div>
                </div>
                {selectedNotification.twilio_sid && (
                  <div>
                    <Label className="text-sm font-semibold">Twilio SID</Label>
                    <div className="font-mono text-xs break-all">{selectedNotification.twilio_sid}</div>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-semibold">Created</Label>
                  <div className="text-sm">
                    {format(new Date(selectedNotification.created_at), 'MMM dd, yyyy HH:mm:ss')}
                  </div>
                </div>
                {selectedNotification.sent_at && (
                  <div>
                    <Label className="text-sm font-semibold">Sent At</Label>
                    <div className="text-sm">
                      {format(new Date(selectedNotification.sent_at), 'MMM dd, yyyy HH:mm:ss')}
                    </div>
                  </div>
                )}
                {selectedNotification.delivered_at && (
                  <div>
                    <Label className="text-sm font-semibold">Delivered At</Label>
                    <div className="text-sm">
                      {format(new Date(selectedNotification.delivered_at), 'MMM dd, yyyy HH:mm:ss')}
                    </div>
                  </div>
                )}
                {selectedNotification.read_at && (
                  <div>
                    <Label className="text-sm font-semibold">Read At</Label>
                    <div className="text-sm">
                      {format(new Date(selectedNotification.read_at), 'MMM dd, yyyy HH:mm:ss')}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-sm font-semibold">Message Content</Label>
                <div className="p-3 bg-muted rounded-lg mt-1 whitespace-pre-wrap text-sm">
                  {selectedNotification.message_content}
                </div>
              </div>
              {selectedNotification.error_message && (
                <div>
                  <Label className="text-sm font-semibold text-red-600">Error Message</Label>
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg mt-1 text-sm text-red-600">
                    {selectedNotification.error_message}
                  </div>
                </div>
              )}
              {selectedNotification.metadata && Object.keys(selectedNotification.metadata).length > 0 && (
                <div>
                  <Label className="text-sm font-semibold">Metadata</Label>
                  <div className="p-3 bg-muted rounded-lg mt-1">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(selectedNotification.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default WhatsAppHistory

