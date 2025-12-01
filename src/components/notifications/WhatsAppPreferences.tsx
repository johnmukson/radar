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
import { 
  MessageSquare, 
  Save, 
  Phone,
  Clock,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Bell
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface WhatsAppPreference {
  id?: string
  user_id: string
  branch_id: string
  whatsapp_phone: string
  enabled: boolean
  emergency_assignments: boolean
  expiry_warnings: boolean
  deadline_reminders: boolean
  low_stock_alerts: boolean
  assignment_completed: boolean
  assignment_cancelled: boolean
  ai_recommendations: boolean
  system_alerts: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  timezone: string
  created_at?: string
  updated_at?: string
}

const WhatsAppPreferences: React.FC = () => {
  const { selectedBranch } = useBranch()
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preference, setPreference] = useState<WhatsAppPreference | null>(null)
  const [formData, setFormData] = useState({
    whatsapp_phone: '',
    enabled: true,
    emergency_assignments: true,
    expiry_warnings: true,
    deadline_reminders: true,
    low_stock_alerts: false,
    assignment_completed: true,
    assignment_cancelled: true,
    ai_recommendations: false,
    system_alerts: true,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    timezone: 'UTC'
  })

  useEffect(() => {
    if (selectedBranch && user) {
      fetchPreference()
    }
  }, [selectedBranch, user])

  const fetchPreference = async () => {
    if (!selectedBranch || !user) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('whatsapp_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('branch_id', selectedBranch.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error
      }

      if (data) {
        setPreference(data)
        setFormData({
          whatsapp_phone: data.whatsapp_phone || '',
          enabled: data.enabled ?? true,
          emergency_assignments: data.emergency_assignments ?? true,
          expiry_warnings: data.expiry_warnings ?? true,
          deadline_reminders: data.deadline_reminders ?? true,
          low_stock_alerts: data.low_stock_alerts ?? false,
          assignment_completed: data.assignment_completed ?? true,
          assignment_cancelled: data.assignment_cancelled ?? true,
          ai_recommendations: data.ai_recommendations ?? false,
          system_alerts: data.system_alerts ?? true,
          quiet_hours_start: data.quiet_hours_start || '22:00',
          quiet_hours_end: data.quiet_hours_end || '08:00',
          timezone: data.timezone || 'UTC'
        })
      } else {
        // No preference exists, use defaults
        setPreference(null)
      }
    } catch (error: any) {
      console.error('Error fetching WhatsApp preferences:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch WhatsApp preferences',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedBranch || !user) return

    // Validate phone number format (should be E.164: +1234567890)
    if (formData.whatsapp_phone && !formData.whatsapp_phone.startsWith('+')) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Phone number must start with + and include country code (e.g., +14155552671)',
        variant: 'destructive'
      })
      return
    }

    setSaving(true)
    try {
      const preferenceData = {
        user_id: user.id,
        branch_id: selectedBranch.id,
        whatsapp_phone: formData.whatsapp_phone,
        enabled: formData.enabled,
        emergency_assignments: formData.emergency_assignments,
        expiry_warnings: formData.expiry_warnings,
        deadline_reminders: formData.deadline_reminders,
        low_stock_alerts: formData.low_stock_alerts,
        assignment_completed: formData.assignment_completed,
        assignment_cancelled: formData.assignment_cancelled,
        ai_recommendations: formData.ai_recommendations,
        system_alerts: formData.system_alerts,
        quiet_hours_start: formData.quiet_hours_start || null,
        quiet_hours_end: formData.quiet_hours_end || null,
        timezone: formData.timezone
      }

      if (preference) {
        // Update existing preference
        const { error } = await supabase
          .from('whatsapp_notification_preferences')
          .update(preferenceData)
          .eq('id', preference.id)

        if (error) throw error
      } else {
        // Create new preference
        const { error } = await supabase
          .from('whatsapp_notification_preferences')
          .insert(preferenceData)

        if (error) throw error
      }

      toast({
        title: 'Success',
        description: 'WhatsApp preferences saved successfully'
      })
      fetchPreference()
    } catch (error: any) {
      console.error('Error saving WhatsApp preferences:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to save WhatsApp preferences',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to configure WhatsApp preferences.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">Loading...</div>
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
            WhatsApp Preferences
          </CardTitle>
          <CardDescription>
            Configure WhatsApp notification settings for {selectedBranch.name} ({selectedBranch.code})
          </CardDescription>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          Save Preferences
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* WhatsApp Phone Number */}
        <div className="space-y-2">
          <Label htmlFor="whatsapp-phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            WhatsApp Phone Number
          </Label>
          <Input
            id="whatsapp-phone"
            type="tel"
            placeholder="+14155552671"
            value={formData.whatsapp_phone}
            onChange={(e) => setFormData({ ...formData, whatsapp_phone: e.target.value })}
            className="max-w-md"
          />
          <p className="text-sm text-muted-foreground">
            Enter your WhatsApp number with country code (e.g., +14155552671)
          </p>
        </div>

        {/* Enable/Disable */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label className="text-base font-semibold">Enable WhatsApp Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Turn on/off all WhatsApp notifications for this branch
            </p>
          </div>
          <Switch
            checked={formData.enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
          />
        </div>

        {formData.enabled && (
          <>
            {/* Notification Types */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Types
              </h3>

              <div className="grid gap-4">
                {[
                  { key: 'emergency_assignments', label: 'Emergency Assignments', description: 'Notifications when emergency assignments are created' },
                  { key: 'expiry_warnings', label: 'Expiry Warnings', description: 'Notifications for items expiring soon' },
                  { key: 'deadline_reminders', label: 'Deadline Reminders', description: 'Reminders for assignment deadlines' },
                  { key: 'assignment_completed', label: 'Assignment Completed', description: 'Notifications when assignments are completed' },
                  { key: 'assignment_cancelled', label: 'Assignment Cancelled', description: 'Notifications when assignments are cancelled' },
                  { key: 'low_stock_alerts', label: 'Low Stock Alerts', description: 'Notifications when stock is running low' },
                  { key: 'ai_recommendations', label: 'AI Recommendations', description: 'Notifications for AI-generated recommendations' },
                  { key: 'system_alerts', label: 'System Alerts', description: 'Important system notifications' }
                ].map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="font-medium">{label}</Label>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                    <Switch
                      checked={formData[key as keyof typeof formData] as boolean}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, [key]: checked })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Quiet Hours */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Quiet Hours
              </h3>
              <p className="text-sm text-muted-foreground">
                Non-critical notifications will not be sent during quiet hours (emergency and system alerts are always sent)
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Start Time</Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={formData.quiet_hours_start}
                    onChange={(e) => setFormData({ ...formData, quiet_hours_start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End Time</Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={formData.quiet_hours_end}
                    onChange={(e) => setFormData({ ...formData, quiet_hours_end: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Timezone
              </Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              >
                <SelectTrigger id="timezone" className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="Africa/Kampala">Kampala (EAT)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                  <SelectItem value="Asia/Kolkata">Mumbai (IST)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Timezone for quiet hours calculation
              </p>
            </div>
          </>
        )}

        {/* Status Badge */}
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          {formData.enabled ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">WhatsApp notifications are enabled</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">WhatsApp notifications are disabled</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default WhatsAppPreferences

