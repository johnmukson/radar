import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Crown } from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'
import type { Database } from '@/integrations/supabase/types'

type AppRole = Database['public']['Enums']['app_role']

interface Branch {
  id: string
  name: string
  code: string
  region: string | null
}

interface RoleAssignmentFormProps {
  branches: Branch[]
  onSubmit: (userEmail: string, selectedRole: AppRole, selectedBranch: string) => void
  loading: boolean
  initialEmail?: string
  initialRole?: AppRole
  initialBranch?: string
}

const RoleAssignmentForm: React.FC<RoleAssignmentFormProps> = ({
  branches,
  onSubmit,
  loading,
  initialEmail = '',
  initialRole,
  initialBranch = '',
}) => {
  const [userEmail, setUserEmail] = useState(initialEmail)
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>(initialRole || '')
  const [selectedBranch, setSelectedBranch] = useState(initialBranch)
  const { isSystemAdmin } = useUserRole()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(userEmail, selectedRole, selectedBranch)
    setUserEmail('')
    setSelectedRole('')
    setSelectedBranch('')
  }

  const getRoleDisplayName = (role: AppRole) => {
    switch (role) {
      case 'system_admin':
        return 'System Admin'
      case 'branch_system_admin':
        return 'Branch System Admin'
      case 'regional_manager':
        return 'Regional Manager'
      case 'admin':
        return 'Admin'
      case 'user':
        return 'User'
      default:
        return role
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Panel - Manage User Roles
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="userEmail">User Email</Label>
            <Input
              id="userEmail"
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="Enter user email address"
              required
            />
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={selectedRole} onValueChange={(value: AppRole) => setSelectedRole(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{getRoleDisplayName('user')}</SelectItem>
                <SelectItem value="admin">{getRoleDisplayName('admin')}</SelectItem>
                <SelectItem value="regional_manager">{getRoleDisplayName('regional_manager')}</SelectItem>
                <SelectItem value="branch_system_admin">{getRoleDisplayName('branch_system_admin')}</SelectItem>
                {isSystemAdmin && (
                  <SelectItem value="system_admin">
                    <div className="flex items-center gap-2">
                      <Crown className="h-3 w-3" />
                      {getRoleDisplayName('system_admin')}
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {!['regional_manager', 'system_admin'].includes(selectedRole) && (
            <div>
              <Label htmlFor="branch">Branch</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? 'Assigning...' : 'Assign Role'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default RoleAssignmentForm
