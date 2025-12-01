import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { UserPlus, Users, Crown, Settings, Shield, User, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNavigate } from 'react-router-dom'
import UserCreation from '@/components/UserCreation'
import { extractErrorMessage } from '@/lib/utils'

type AppRole = Database['public']['Enums']['app_role']

interface UserWithRole {
  id: string;
  email: string;
  name: string;
  status: string;
  role?: AppRole;
  branch_id?: string | null;
  branch_name?: string | null;
  phone?: string | null;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  region: string | null;
}

const UserManagement = () => {
  const { user } = useAuth()
  const { hasAdminAccess } = useUserRole()
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  
  const [showAssignRoleDialog, setShowAssignRoleDialog] = useState(false)
  const [selectedUserForRole, setSelectedUserForRole] = useState<UserWithRole | null>(null)
  const [roleToAssign, setRoleToAssign] = useState<AppRole>('dispenser')
  const [branchForRole, setBranchForRole] = useState('')

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editUser, setEditUser] = useState<UserWithRole | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false)

  const navigate = useNavigate();

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadUsers(), loadBranches()]);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasAdminAccess) {
      loadInitialData()
    } else {
      setLoading(false)
    }
  }, [hasAdminAccess, loadInitialData])

  const loadUsers = async () => {
    try {
      // Use a more reliable query that includes all users
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          name,
          phone,
          status,
          user_roles(role, branch_id, branches(name, code))
        `)
        .order('name');
      if (error) throw error
      
      console.log('Loaded users:', data);
      
      // Transform the data to match the expected format
      const transformedUsers = data?.map(user => {
        const userRole = user.user_roles?.[0];
        const branch = userRole?.branches?.[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          status: user.status,
          role: userRole?.role || null,
          branch_id: userRole?.branch_id || null,
          branch_name: branch?.name || null
        };
      }) || [];
      
      console.log('Transformed users:', transformedUsers);
      
      // Check for users with null IDs
      const usersWithNullIds = transformedUsers.filter(user => !user.id);
      if (usersWithNullIds.length > 0) {
        console.warn('Found users with null IDs:', usersWithNullIds);
      }
      
      setUsers(transformedUsers)
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to load users")
      toast({ title: "Error", description: errorMessage, variant: "destructive" })
    }
  }

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase.from('branches').select('*').order('name');
      if (error) throw error
      setBranches(data || [])
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to load branches")
      toast({ title: "Error", description: errorMessage, variant: "destructive" })
    }
  }

  const handleAssignRole = async () => {
    if (!selectedUserForRole || !roleToAssign) {
      toast({ title: "Error", description: "User and role are required.", variant: "destructive" });
      return;
    }

    // Validate that we have a valid user ID
    if (!selectedUserForRole.id) {
      console.error('Selected user has no ID:', selectedUserForRole);
      toast({ title: "Error", description: "Invalid user ID. Please try refreshing the page.", variant: "destructive" });
      return;
    }

    const requiresBranch = !['system_admin', 'regional_manager'].includes(roleToAssign);
    if (requiresBranch && !branchForRole) {
      toast({ title: "Error", description: "Branch is required for this role.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      console.log('Assigning role:', {
        user_id: selectedUserForRole.id,
        user_email: selectedUserForRole.email,
        user_name: selectedUserForRole.name,
        role: roleToAssign,
        branch_id: requiresBranch ? branchForRole : null
      });

      // Check current roles for this user
      const { data: currentRoles, error: checkError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', selectedUserForRole.id);
      
      console.log('Current roles before assignment:', currentRoles);

      // First, ensure the user exists in the users table
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: selectedUserForRole.id,
          email: selectedUserForRole.email,
          name: selectedUserForRole.name,
          status: 'active'
        }, { onConflict: 'id' });

      if (userError) {
        console.error('User upsert error:', userError);
        throw userError;
      }

      // Then assign the role
      // First, remove any existing roles for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', selectedUserForRole.id);

      if (deleteError) {
        console.error('Error deleting existing roles:', deleteError);
        throw deleteError;
      }

      // Then insert the new role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: selectedUserForRole.id,
          role: roleToAssign,
          branch_id: requiresBranch ? branchForRole : null
        });

      if (roleError) {
        console.error('Role assignment error:', roleError);
        throw roleError;
      }

      // Check the new role assignment
      const { data: newRoles, error: newCheckError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', selectedUserForRole.id);
      
      console.log('New roles after assignment:', newRoles);

      toast({ title: "Success", description: `Role assigned to ${selectedUserForRole.email}` });
      setShowAssignRoleDialog(false);
      
      // Force refresh the user list with a small delay to ensure data is updated
      setTimeout(async () => {
        await loadUsers();
      }, 500);
    } catch (error: unknown) {
      console.error('Error in handleAssignRole:', error);
      const errorMessage = extractErrorMessage(error, "Failed to assign role")
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openAssignRoleDialog = (user: UserWithRole) => {
    setSelectedUserForRole(user);
    setRoleToAssign(user.role || 'dispenser');
    setBranchForRole(user.branch_id || '');
    setShowAssignRoleDialog(true);
  };

  const openEditDialog = (user: UserWithRole) => {
    setEditUser(user);
    setEditName(user.name || '');
    setEditPhone(user.phone || '');
    setShowEditDialog(true);
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('users').update({ name: editName, phone: editPhone }).eq('id', editUser.id);
      if (error) throw error;
      toast({ title: "Success", description: "User updated successfully." });
      setShowEditDialog(false);
      await loadUsers();
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to update user")
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
      return
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error && !error.message.includes('User not found')) {
        throw error;
      }
      toast({ title: "Success", description: "User deleted successfully." });
      await loadUsers();
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to delete user")
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const getRoleIcon = (role?: AppRole) => {
    if (!role) return <User className="h-4 w-4 text-blue-600" />;
    switch (role) {
      case 'system_admin': return <Crown className="h-4 w-4 text-red-600" />;
      case 'branch_system_admin': return <Settings className="h-4 w-4 text-orange-600" />;
      case 'regional_manager': return <Shield className="h-4 w-4 text-purple-600" />;
      case 'admin': return <Users className="h-4 w-4 text-green-600" />;
      default: return <User className="h-4 w-4 text-blue-600" />;
    }
  }

  const getRoleVariant = (role?: AppRole): "default" | "destructive" | "outline" | "secondary" => {
    if (!role) return 'outline';
    switch (role) {
      case 'system_admin': return 'destructive';
      case 'branch_system_admin': return 'default';
      case 'regional_manager': return 'secondary';
      default: return 'outline';
    }
  }

  const getRoleDisplayName = (role?: AppRole) => {
    if (!role) return 'No Role';
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
    )
  }

  if (!hasAdminAccess) {
    return (
      <div className="p-6">
          <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                  Access denied. You do not have permission to manage users.
              </AlertDescription>
          </Alert>
      </div>
    )
  }

  return (
    <>
      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>User Management</CardTitle>
                <p className="text-sm text-muted-foreground">Manage all users, roles, and permissions.</p>
              </div>
              {hasAdminAccess && (
                <Button variant="ghost" size="icon" onClick={() => setShowCreateUserDialog(true)} title="Create User">
                  <UserPlus className="h-6 w-6 text-blue-600" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-sm text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleVariant(u.role)}>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(u.role)}
                          {getRoleDisplayName(u.role)}
                        </div>
                      </Badge>
                    </TableCell>
                    <TableCell>{u.branch_name || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={u.status === 'active' ? 'default' : 'secondary'}>
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(u)}>
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAssignRoleDialog(u)}>
                            <Crown className="mr-2 h-4 w-4" />
                            Assign/Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteUser(u.id)} className="text-red-500">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Assign Role Dialog */}
      <Dialog open={showAssignRoleDialog} onOpenChange={setShowAssignRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role to {selectedUserForRole?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-assign">Role</Label>
              <Select value={roleToAssign} onValueChange={(v) => setRoleToAssign(v as AppRole)}>
                  <SelectTrigger id="role-assign"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system_admin">System Admin</SelectItem>
                    <SelectItem value="branch_system_admin">Branch System Admin</SelectItem>
                    <SelectItem value="regional_manager">Regional Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="dispenser">Dispenser</SelectItem>
                  </SelectContent>
              </Select>
            </div>
            {!['system_admin', 'regional_manager'].includes(roleToAssign) && (
              <div className="space-y-2">
                <Label htmlFor="branch-assign">Branch</Label>
                <Select value={branchForRole} onValueChange={setBranchForRole}>
                  <SelectTrigger id="branch-assign"><SelectValue placeholder="Select a branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAssignRoleDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignRole} disabled={loading}>
              {loading ? 'Assigning...' : 'Assign Role'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
              <DialogHeader><DialogTitle>Edit {editUser?.name}</DialogTitle></DialogHeader>
              <form onSubmit={handleEditSubmit}>
                  <div className="space-y-4 py-4">
                      <div className="space-y-2">
                          <Label htmlFor="edit-name">Full Name</Label>
                          <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="edit-phone">Phone Number</Label>
                          <Input id="edit-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                      </div>
                  </div>
                  <div className="flex justify-end gap-2">
                      <Button variant="outline" type="button" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                      <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
                  </div>
              </form>
          </DialogContent>
      </Dialog>

      <Dialog open={showCreateUserDialog} onOpenChange={setShowCreateUserDialog}>
        <DialogContent className="max-w-md w-full">
          <UserCreation />
        </DialogContent>
      </Dialog>
    </>
  )
}

export default UserManagement