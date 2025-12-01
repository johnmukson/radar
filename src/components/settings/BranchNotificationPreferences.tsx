import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Bell, 
  Save, 
  Mail, 
  MessageSquare, 
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Settings
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useUserRole } from '@/hooks/useUserRole'

interface NotificationPreference {
  id: string
  branch_id: string
  notification_type: string
  enabled: boolean
  channels: string[]
  alert_thresholds: Record<string, any>
  low_stock_threshold: number
  expiry_warning_days: number
  emergency_alert_enabled: boolean
  assignment_reminder_enabled: boolean
  deadline_reminder_days: number
  created_at: string
  updated_at: string
}

const BranchNotificationPreferences: React.FC = () => {
  const { selectedBranch } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess, userRole } = useUserRole()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [formData, setFormData] = useState({
    email: {
      enabled: true,
      low_stock_threshold: 10,
      expiry_warning_days: 30,
      emergency_alert_enabled: true,
      assignment_reminder_enabled: true,
      deadline_reminder_days: 7
    },
    sms: {
      enabled: false,
      low_stock_threshold: 10,
      expiry_warning_days: 30,
      emergency_alert_enabled: true,
      assignment_reminder_enabled: true,
      deadline_reminder_days: 7
    },
    in_app: {
      enabled: true,
      low_stock_threshold: 10,
      expiry_warning_days: 30,
      emergency_alert_enabled: true,
      assignment_reminder_enabled: true,
      deadline_reminder_days: 7
    }
  })

  const canManagePreferences = hasAdminAccess || userRole === 'branch_manager' || userRole === 'branch_system_admin'

  useEffect(() => {
    if (selectedBranch) {
      fetchPreferences()
    }
  }, [selectedBranch])

  const fetchPreferences = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
      const { data, error } = await (supabase as any)
        .from('branch_notification_preferences')
        .select('*')
        .eq('branch_id', selectedBranch.id)

      if (error) throw error

      const prefs: {
        email: typeof formData.email
        sms: typeof formData.sms
        in_app: typeof formData.in_app
      } = {
        email: {
          enabled: true,
          low_stock_threshold: 10,
          expiry_warning_days: 30,
          emergency_alert_enabled: true,
          assignment_reminder_enabled: true,
          deadline_reminder_days: 7
        },
        sms: {
          enabled: false,
          low_stock_threshold: 10,
          expiry_warning_days: 30,
          emergency_alert_enabled: true,
          assignment_reminder_enabled: true,
          deadline_reminder_days: 7
        },
        in_app: {
          enabled: true,
          low_stock_threshold: 10,
          expiry_warning_days: 30,
          emergency_alert_enabled: true,
          assignment_reminder_enabled: true,
          deadline_reminder_days: 7
        }
      }

      const normalizedData: NotificationPreference[] = Array.isArray(data)
        ? data.map((pref: any) => ({
            id: pref.id?.toString() ?? '',
            branch_id: pref.branch_id ?? selectedBranch.id,
            notification_type: pref.notification_type ?? 'email',
            enabled: pref.enabled ?? true,
            channels: pref.channels ?? [],
            alert_thresholds: pref.alert_thresholds ?? {},
            low_stock_threshold: pref.low_stock_threshold ?? 10,
            expiry_warning_days: pref.expiry_warning_days ?? 30,
            emergency_alert_enabled: pref.emergency_alert_enabled ?? true,
            assignment_reminder_enabled: pref.assignment_reminder_enabled ?? true,
            deadline_reminder_days: pref.deadline_reminder_days ?? 7,
            created_at: pref.created_at ?? new Date().toISOString(),
            updated_at: pref.updated_at ?? new Date().toISOString(),
          }))
        : []

      if (normalizedData.length > 0) {
        normalizedData.forEach((pref) => {
          const type = pref.notification_type as keyof typeof prefs
          if (type === 'email' || type === 'sms' || type === 'in_app') {
            prefs[type] = {
              enabled: pref.enabled,
              low_stock_threshold: pref.low_stock_threshold,
              expiry_warning_days: pref.expiry_warning_days,
              emergency_alert_enabled: pref.emergency_alert_enabled,
              assignment_reminder_enabled: pref.assignment_reminder_enabled,
              deadline_reminder_days: pref.deadline_reminder_days
            }
          }
        })
      }

      setPreferences(normalizedData)
      setFormData(prefs)
    } catch (error: any) {
      console.error('Error fetching preferences:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch notification preferences',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (type: 'email' | 'sms' | 'in_app') => {
    if (!selectedBranch || !user) return

    setSaving(true)
    try {
      const data = formData[type]
      const existing = preferences.find(p => p.notification_type === type)

      if (existing) {
        const { error } = await (supabase as any)
          .from('branch_notification_preferences')
          .update({
            enabled: data.enabled,
            low_stock_threshold: data.low_stock_threshold,
            expiry_warning_days: data.expiry_warning_days,
            emergency_alert_enabled: data.emergency_alert_enabled,
            assignment_reminder_enabled: data.assignment_reminder_enabled,
            deadline_reminder_days: data.deadline_reminder_days,
            updated_by: user.id
          })
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('branch_notification_preferences')
          .insert({
            branch_id: selectedBranch.id,
            notification_type: type,
            enabled: data.enabled,
            channels: [],
            alert_thresholds: {},
            low_stock_threshold: data.low_stock_threshold,
            expiry_warning_days: data.expiry_warning_days,
            emergency_alert_enabled: data.emergency_alert_enabled,
            assignment_reminder_enabled: data.assignment_reminder_enabled,
            deadline_reminder_days: data.deadline_reminder_days,
            created_by: user.id,
            updated_by: user.id
          })

        if (error) throw error
      }

      toast({
        title: 'Success',
        description: `${type.toUpperCase()} preferences saved successfully`
      })
      await fetchPreferences()
    } catch (error: any) {
      console.error('Error saving preferences:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to save preferences',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAll = async () => {
    const types: Array<'email' | 'sms' | 'in_app'> = ['email', 'sms', 'in_app']
    await Promise.all(types.map(type => handleSave(type)))
  }

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to view notification preferences.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!canManagePreferences) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to manage notification preferences.
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
            <Bell className="h-6 w-6" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Configure notification settings for {selectedBranch.name} ({selectedBranch.code})
          </CardDescription>
        </div>
        <Button onClick={handleSaveAll} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          Save All
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center p-4">Loading...</div>
        ) : (
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="email">
                <Mail className="mr-2 h-4 w-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="sms">
                <MessageSquare className="mr-2 h-4 w-4" />
                SMS
              </TabsTrigger>
              <TabsTrigger value="whatsapp">
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="in_app">
                <Smartphone className="mr-2 h-4 w-4" />
                In-App
              </TabsTrigger>
            </TabsList>

            {(['email', 'sms', 'in_app'] as const).map((type: 'email' | 'sms' | 'in_app') => (
              <TabsContent key={type} value={type} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold capitalize">{type} Notifications</h3>
                    <Badge variant={formData[type].enabled ? 'default' : 'secondary'}>
                      {formData[type].enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <Button onClick={() => handleSave(type)} disabled={saving} size="sm">
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable {type.toUpperCase()} Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Turn on/off all {type} notifications for this branch
                      </p>
                    </div>
                    <Switch
                      checked={formData[type].enabled}
                      onCheckedChange={(checked) => {
                        const updated = { ...formData }
                        updated[type] = { ...updated[type], enabled: checked }
                        setFormData(updated)
                      }}
                    />
                  </div>

                  {formData[type].enabled && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor={`${type}-low-stock`}>Low Stock Threshold</Label>
                        <Input
                          id={`${type}-low-stock`}
                          type="number"
                          value={formData[type].low_stock_threshold}
                          onChange={(e) => {
                            const updated = { ...formData }
                            updated[type] = {
                              ...updated[type],
                              low_stock_threshold: parseInt(e.target.value) || 0
                            }
                            setFormData(updated)
                          }}
                        />
                        <p className="text-sm text-muted-foreground">
                          Alert when stock quantity falls below this number
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${type}-expiry`}>Expiry Warning Days</Label>
                        <Input
                          id={`${type}-expiry`}
                          type="number"
                          value={formData[type].expiry_warning_days}
                          onChange={(e) => {
                            const updated = { ...formData }
                            updated[type] = {
                              ...updated[type],
                              expiry_warning_days: parseInt(e.target.value) || 0
                            }
                            setFormData(updated)
                          }}
                        />
                        <p className="text-sm text-muted-foreground">
                          Send warning when items expire within this many days
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Emergency Alerts</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive alerts for emergency declarations
                          </p>
                        </div>
                        <Switch
                          checked={formData[type].emergency_alert_enabled}
                          onCheckedChange={(checked) => {
                            const updated = { ...formData }
                            updated[type] = { ...updated[type], emergency_alert_enabled: checked }
                            setFormData(updated)
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Assignment Reminders</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive reminders for pending assignments
                          </p>
                        </div>
                        <Switch
                          checked={formData[type].assignment_reminder_enabled}
                          onCheckedChange={(checked) => {
                            const updated = { ...formData }
                            updated[type] = { ...updated[type], assignment_reminder_enabled: checked }
                            setFormData(updated)
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${type}-deadline`}>Deadline Reminder Days</Label>
                        <Input
                          id={`${type}-deadline`}
                          type="number"
                          value={formData[type].deadline_reminder_days}
                          onChange={(e) => {
                            const updated = { ...formData }
                            updated[type] = {
                              ...updated[type],
                              deadline_reminder_days: parseInt(e.target.value) || 0
                            }
                            setFormData(updated)
                          }}
                        />
                        <p className="text-sm text-muted-foreground">
                          Send reminder this many days before assignment deadline
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            ))}

            {/* WhatsApp Tab */}
            <TabsContent value="whatsapp" className="space-y-6">
              <div className="text-center text-muted-foreground p-4">
                <p className="mb-4">For detailed WhatsApp preferences, please use the dedicated WhatsApp Preferences section in Settings.</p>
                <p className="text-sm">WhatsApp notifications are managed per-user, not per-branch. Each user can configure their own WhatsApp preferences including phone number, quiet hours, and notification types.</p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

export default BranchNotificationPreferences

