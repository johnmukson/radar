import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { 
  Settings, 
  Save, 
  Plus, 
  Edit, 
  Trash2, 
  Building2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useUserRole } from '@/hooks/useUserRole'

interface BranchSetting {
  id: string
  branch_id: string
  setting_key: string
  setting_value: any
  description: string | null
  created_at: string
  updated_at: string
}

const BranchSettings: React.FC = () => {
  const { selectedBranch } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess, userRole } = useUserRole()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<BranchSetting[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [editingSetting, setEditingSetting] = useState<BranchSetting | null>(null)
  const [formData, setFormData] = useState({
    setting_key: '',
    setting_value: '',
    description: ''
  })

  const canManageSettings = hasAdminAccess || userRole === 'branch_manager' || userRole === 'branch_system_admin'

  useEffect(() => {
    if (selectedBranch) {
      fetchSettings()
    }
  }, [selectedBranch])

  const fetchSettings = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('branch_id', selectedBranch.id)
        .order('setting_key')

      if (error) throw error
      setSettings(data || [])
    } catch (error: any) {
      console.error('Error fetching settings:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch branch settings',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedBranch || !user || !formData.setting_key) return

    try {
      let settingValue: any
      try {
        settingValue = JSON.parse(formData.setting_value)
      } catch {
        settingValue = formData.setting_value
      }

      if (editingSetting) {
        const { error } = await supabase
          .from('branch_settings')
          .update({
            setting_value: settingValue,
            description: formData.description || null,
            updated_by: user.id
          })
          .eq('id', editingSetting.id)

        if (error) throw error

        toast({
          title: 'Success',
          description: 'Setting updated successfully'
        })
      } else {
        const { error } = await supabase
          .from('branch_settings')
          .insert({
            branch_id: selectedBranch.id,
            setting_key: formData.setting_key,
            setting_value: settingValue,
            description: formData.description || null,
            created_by: user.id,
            updated_by: user.id
          })

        if (error) throw error

        toast({
          title: 'Success',
          description: 'Setting created successfully'
        })
      }

      setShowDialog(false)
      setEditingSetting(null)
      setFormData({ setting_key: '', setting_value: '', description: '' })
      fetchSettings()
    } catch (error: any) {
      console.error('Error saving setting:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to save setting',
        variant: 'destructive'
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this setting?')) return

    try {
      const { error } = await supabase
        .from('branch_settings')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Setting deleted successfully'
      })
      fetchSettings()
    } catch (error: any) {
      console.error('Error deleting setting:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete setting',
        variant: 'destructive'
      })
    }
  }

  const handleEdit = (setting: BranchSetting) => {
    setEditingSetting(setting)
    setFormData({
      setting_key: setting.setting_key,
      setting_value: typeof setting.setting_value === 'string' 
        ? setting.setting_value 
        : JSON.stringify(setting.setting_value, null, 2),
      description: setting.description || ''
    })
    setShowDialog(true)
  }

  const handleNew = () => {
    setEditingSetting(null)
    setFormData({ setting_key: '', setting_value: '', description: '' })
    setShowDialog(true)
  }

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Branch Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to view settings.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!canManageSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Branch Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to manage branch settings.
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
            <Settings className="h-6 w-6" />
            Branch Settings
          </CardTitle>
          <CardDescription>
            Configure settings for {selectedBranch.name} ({selectedBranch.code})
          </CardDescription>
        </div>
        <Button onClick={handleNew} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Setting
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center p-4">Loading...</div>
        ) : settings.length === 0 ? (
          <div className="text-center text-muted-foreground p-8">
            No settings configured. Click "Add Setting" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setting Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((setting) => (
                <TableRow key={setting.id}>
                  <TableCell className="font-medium">{setting.setting_key}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted p-1 rounded">
                      {typeof setting.setting_value === 'string'
                        ? setting.setting_value
                        : JSON.stringify(setting.setting_value)}
                    </code>
                  </TableCell>
                  <TableCell>{setting.description || '-'}</TableCell>
                  <TableCell>
                    {new Date(setting.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(setting)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(setting.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSetting ? 'Edit Setting' : 'New Setting'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="setting_key">Setting Key</Label>
              <Input
                id="setting_key"
                value={formData.setting_key}
                onChange={(e) => setFormData({ ...formData, setting_key: e.target.value })}
                disabled={!!editingSetting}
                placeholder="e.g., custom_field_enabled"
              />
            </div>
            <div>
              <Label htmlFor="setting_value">Setting Value (JSON)</Label>
              <Textarea
                id="setting_value"
                value={formData.setting_value}
                onChange={(e) => setFormData({ ...formData, setting_value: e.target.value })}
                placeholder='e.g., true, "value", {"key": "value"}'
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default BranchSettings

