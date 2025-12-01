
import React from 'react'
import { useAdminManager } from '@/hooks/useAdminManager'
import { useUserRole } from '@/hooks/useUserRole'
import RoleAssignmentForm from '@/components/admin-manager/RoleAssignmentForm'
import UserRolesList from '@/components/admin-manager/UserRolesList'
import RoleDescriptions from '@/components/admin-manager/RoleDescriptions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Crown, Settings } from 'lucide-react'
import AddBranchButton from '@/components/AddBranchButton'

const AdminManager = () => {
  const { userRoles, branches, loading, assignRole, removeUserRole } = useAdminManager()
  const { isSystemAdmin, isBranchSystemAdmin, hasAdminAccess } = useUserRole()

  const canManageUsers = isSystemAdmin || isBranchSystemAdmin || hasAdminAccess

  if (!canManageUsers) {
    return (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Access denied. Only System Administrators, Branch System Administrators, and Administrators can manage user roles and accounts.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <Alert>
        <div className="flex items-center gap-2">
          {isSystemAdmin ? (
            <Crown className="h-4 w-4 text-red-600" />
          ) : (
            <Settings className="h-4 w-4 text-orange-600" />
          )}
        </div>
        <AlertDescription>
          <strong>User Account Management</strong>
          <br />
          As a {isSystemAdmin ? 'System Administrator' : 'Branch System Administrator'}, you can create accounts for new users by assigning them roles. Users cannot self-register and must contact administrators for account creation.
        </AlertDescription>
      </Alert>
      
      <RoleAssignmentForm 
        branches={branches}
        onSubmit={assignRole}
        loading={loading}
      />
      
      <UserRolesList 
        userRoles={userRoles}
        onRemoveRole={removeUserRole}
      />
      
      <RoleDescriptions />

      {/* Branch creation for system and branch system admins */}
      {(isSystemAdmin || isBranchSystemAdmin) && <AddBranchButton />}
    </div>
  )
}

export default AdminManager
