import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Crown, Settings, Building2, UserCheck, UserX, Search } from 'lucide-react'
import type { Database } from '@/integrations/supabase/types'

type AppRole = Database['public']['Enums']['app_role']

interface UserRole {
  id: string
  user_id: string
  role: AppRole
  branch_id: string | null
  created_at: string
  branches?: {
    name: string
    code: string
  } | null
  users?: {
    name: string
    email: string
  } | null
}

interface UserRolesListProps {
  userRoles: UserRole[]
  onRemoveRole: (roleId: string) => Promise<void>
}

const UserRolesList = ({ userRoles, onRemoveRole }: UserRolesListProps) => {
  const [searchTerm, setSearchTerm] = useState('')

  const getRoleIcon = (role: AppRole) => {
    switch (role) {
      case 'system_admin':
        return <Crown className="h-4 w-4 text-red-600" />
      case 'branch_system_admin':
        return <Settings className="h-4 w-4 text-orange-600" />
      case 'regional_manager':
        return <Building2 className="h-4 w-4 text-purple-600" />
      case 'admin':
        return <UserCheck className="h-4 w-4 text-green-600" />
      default:
        return <UserX className="h-4 w-4 text-blue-600" />
    }
  }

  const getRoleStyle = (role: AppRole) => {
    switch (role) {
      case 'system_admin':
        return 'bg-red-100 text-red-800'
      case 'branch_system_admin':
        return 'bg-orange-100 text-orange-800'
      case 'regional_manager':
        return 'bg-purple-100 text-purple-800'
      case 'admin':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
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
      case 'dispenser':
        return 'Dispenser'
      default:
        return role
    }
  }

  // Filter user roles based on search term
  const filteredUserRoles = userRoles.filter(userRole => {
    const searchLower = searchTerm.toLowerCase()
    const userName = userRole.users?.name?.toLowerCase() || ''
    const userEmail = userRole.users?.email?.toLowerCase() || ''
    const roleName = getRoleDisplayName(userRole.role).toLowerCase()
    const branchName = userRole.branches?.name?.toLowerCase() || ''
    
    return userName.includes(searchLower) || 
           userEmail.includes(searchLower) || 
           roleName.includes(searchLower) ||
           branchName.includes(searchLower)
  })

  const maxVisible = 10;
  const visibleRoles = filteredUserRoles.slice(0, maxVisible);
  const hasMore = filteredUserRoles.length > maxVisible;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Current User Roles</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, role, or branch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredUserRoles.length} of {userRoles.length} users
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {visibleRoles.length === 0 ? (
            <p className="text-muted-foreground">
              {searchTerm ? 'No users found matching your search.' : 'No user roles assigned yet.'}
            </p>
          ) : (
            visibleRoles.map((userRole) => (
              <Card key={userRole.id} className="w-full shadow-md">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {getRoleIcon(userRole.role)}
                      <div>
                        <div className="font-medium text-base">
                          {userRole.users?.name || userRole.users?.email || userRole.user_id}
                        </div>
                        {userRole.users?.email && userRole.users?.name && (
                          <div className="text-xs text-muted-foreground">
                            {userRole.users.email}
                          </div>
                        )}
                        {userRole.branches && (
                          <div className="text-xs text-muted-foreground">
                            {userRole.branches.name} ({userRole.branches.code})
                          </div>
                        )}
                        {userRole.role === 'system_admin' && (
                          <div className="text-xs text-red-600 font-medium">
                            Extreme Control - All Activities
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getRoleStyle(userRole.role)}`}>
                      {getRoleDisplayName(userRole.role)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mt-2">
                    {userRole.role !== 'system_admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRemoveRole(userRole.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {hasMore && (
            <Card className="w-full flex items-center justify-center h-24 text-muted-foreground">
              <CardContent className="flex items-center justify-center h-full">
                View {filteredUserRoles.length - maxVisible} more roles
              </CardContent>
            </Card>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default UserRolesList
