import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { UserPlus, Users, Crown, Settings, Shield, User, MoreHorizontal, RefreshCw, Trash2, Building2, ChevronDown, ChevronRight } from 'lucide-react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import { useBranch } from '@/contexts/BranchContext'

type AppRole = Database['public']['Enums']['app_role']

interface UserRoleBranch {
  role: AppRole;
  branch_id: string | null;
  branch_name: string | null;
  branch_code: string | null;
}

interface UserWithRole {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: UserRoleBranch[]; // ✅ Multiple roles/branches per user
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
  const { hasAdminAccess, isSystemAdmin: userIsSystemAdmin, isBranchSystemAdmin } = useUserRole()
  const { selectedBranch, isSystemAdmin, isRegionalManager } = useBranch() // ✅ Add branch context
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const [branchFilter, setBranchFilter] = useState<string>('all') // ✅ Add branch filter
  
  // ✅ Determine if current user is system admin (only one who sees all users)
  const canSeeAllUsers = userIsSystemAdmin
  // ✅ Determine if current user can manage roles (system admin or branch admin for their branch)
  const canManageRoles = userIsSystemAdmin || (isBranchSystemAdmin && selectedBranch)
  
  const [showAssignRoleDialog, setShowAssignRoleDialog] = useState(false)
  const [selectedUserForRole, setSelectedUserForRole] = useState<UserWithRole | null>(null)
  const [roleToAssign, setRoleToAssign] = useState<AppRole>('dispenser')
  const [branchForRole, setBranchForRole] = useState('')

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editUser, setEditUser] = useState<UserWithRole | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false)
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set()) // ✅ Track expanded branches

  const navigate = useNavigate();

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadUsers(), loadBranches()]);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasAdminAccess || canManageRoles) {
      loadInitialData()
    } else {
      setLoading(false)
    }
  }, [hasAdminAccess, canManageRoles, loadInitialData, selectedBranch]) // ✅ Re-load when branch changes

  const loadUsers = async () => {
    try {
      let query = supabase
        .from('users')
        .select(`
          id,
          email,
          name,
          phone,
          status,
          user_roles(
            role,
            branch_id,
            branches(id, name, code, region)
          )
        `)
        .order('name');
      
      // ✅ If not system admin, filter users by selected branch
      if (!canSeeAllUsers && selectedBranch) {
        // Filter users who have roles in the selected branch
        // This is done at application level after fetch due to Supabase query limitations
      }
      
      const { data, error } = await query;
      if (error) throw error
      
      console.log('Loaded users with roles:', data);
      
      // ✅ Transform to show ALL roles/branches per user
      let transformedUsers: UserWithRole[] = (data || []).map((user: any) => {
        // Get all roles with their branches
        const userRoles = Array.isArray(user.user_roles) ? user.user_roles : [];
        const roles: UserRoleBranch[] = userRoles.map((ur: any) => ({
          role: ur.role,
          branch_id: ur.branch_id,
          branch_name: ur.branches?.name || null,
          branch_code: ur.branches?.code || null
        }));
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          status: user.status,
          roles: roles // ✅ All roles/branches
        };
      }) || [];
      
      // ✅ Filter by selected branch if not system admin
      if (!canSeeAllUsers && selectedBranch) {
        transformedUsers = transformedUsers.filter(user => 
          user.roles.some(r => r.branch_id === selectedBranch.id)
        );
      }
      
      console.log('Transformed users with all roles:', transformedUsers);
      
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

    // ✅ Branch-scoped validation: Branch admins can only assign roles within their branch
    if (!canSeeAllUsers && isBranchSystemAdmin && selectedBranch) {
      if (branchForRole !== selectedBranch.id) {
        toast({ 
          title: "Error", 
          description: `You can only assign roles within your branch (${selectedBranch.name}).`, 
          variant: "destructive" 
        });
        return;
      }
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

      // ✅ For branch admins: Only remove roles for the current branch, keep others
      // ✅ For system admins: Remove all roles (existing behavior)
      if (canSeeAllUsers) {
        // System admin: Remove all existing roles
        const { error: deleteError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', selectedUserForRole.id);

        if (deleteError) {
          console.error('Error deleting existing roles:', deleteError);
          throw deleteError;
        }
      } else if (isBranchSystemAdmin && selectedBranch) {
        // Branch admin: Only remove roles for this branch
        const { error: deleteError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', selectedUserForRole.id)
          .eq('branch_id', selectedBranch.id);

        if (deleteError) {
          console.error('Error deleting branch roles:', deleteError);
          throw deleteError;
        }
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
    // Get the first role or default to dispenser
    const firstRole = user.roles?.[0];
    setRoleToAssign(firstRole?.role || 'dispenser');
    
    // ✅ For branch admins, always use their selected branch
    if (!canSeeAllUsers && isBranchSystemAdmin && selectedBranch) {
      setBranchForRole(selectedBranch.id);
    } else {
      setBranchForRole(firstRole?.branch_id || '');
    }
    
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

  // ✅ Group users by branch for system admin, filter for others
  const groupedUsersByBranch = useMemo(() => {
    if (!canSeeAllUsers) {
      // Non-system admins: Already filtered by selected branch in loadUsers
      return { [selectedBranch?.id || 'current']: users };
    }

    // System admin: Group by branch
    const grouped: Record<string, UserWithRole[]> = {
      'no-branch': [],
    };

    users.forEach(user => {
      if (user.roles.length === 0 || user.roles.every(r => !r.branch_id)) {
        grouped['no-branch'].push(user);
      } else {
        user.roles.forEach(roleBranch => {
          if (roleBranch.branch_id) {
            const branchId = roleBranch.branch_id;
            if (!grouped[branchId]) {
              grouped[branchId] = [];
            }
            // Only add user once per branch (avoid duplicates if user has multiple roles in same branch)
            if (!grouped[branchId].find(u => u.id === user.id)) {
              grouped[branchId].push(user);
            }
          }
        });
      }
    });

    return grouped;
  }, [users, canSeeAllUsers, selectedBranch]);

  // ✅ Get filtered users based on branch filter (for system admin) or all users (for branch admin)
  const filteredUsers = useMemo(() => {
    if (!canSeeAllUsers) {
      // Branch admins: Show all users in their branch (already filtered)
      return users;
    }

    // System admin: Apply branch filter
    if (branchFilter === 'all') {
      return users;
    }
    if (branchFilter === 'no-branch') {
      return groupedUsersByBranch['no-branch'] || [];
    }
    return groupedUsersByBranch[branchFilter] || [];
  }, [users, branchFilter, groupedUsersByBranch, canSeeAllUsers]);

  // ✅ Initialize expanded branches when grouped view loads (collapsed by default)
  useEffect(() => {
    if (canSeeAllUsers && branchFilter === 'all') {
      // Start with all branches collapsed (empty set)
      setExpandedBranches(new Set());
    }
  }, [canSeeAllUsers, branchFilter, groupedUsersByBranch]);

  // ✅ Toggle branch expansion
  const toggleBranch = (branchId: string) => {
    setExpandedBranches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(branchId)) {
        newSet.delete(branchId);
      } else {
        newSet.add(branchId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
    )
  }

  if (!hasAdminAccess && !canManageRoles) {
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

  // ✅ Branch admins must have a selected branch
  if (!canSeeAllUsers && !selectedBranch) {
    return (
      <div className="p-6">
          <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                  Please select a branch to manage users.
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
            {/* ✅ Branch Filter - Only show for system admin */}
            {canSeeAllUsers && (
              <div className="mb-4 flex items-center gap-4">
                <Label htmlFor="branch-filter" className="text-sm font-medium">Filter by Branch:</Label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger id="branch-filter" className="w-[250px]">
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches (Grouped View)</SelectItem>
                    <SelectItem value="no-branch">No Branch (System/Regional Admins)</SelectItem>
                    {branches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-sm text-muted-foreground">
                  Showing {filteredUsers.length} of {users.length} users
                </div>
              </div>
            )}

            {/* ✅ Branch context for branch admins */}
            {!canSeeAllUsers && selectedBranch && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Managing users for: <strong>{selectedBranch.name}</strong> ({selectedBranch.code})
                  </span>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  You can only view and manage users assigned to this branch.
                </p>
              </div>
            )}

            {/* ✅ Grouped view for system admin, simple list for branch admin */}
            {canSeeAllUsers && branchFilter === 'all' ? (
              // System admin: Show grouped by branch (collapsible)
              <div className="space-y-4">
                {Object.entries(groupedUsersByBranch).map(([branchId, branchUsers]) => {
                  const branch = branchId === 'no-branch' 
                    ? { name: 'System/Regional Admins', code: 'N/A', id: 'no-branch' }
                    : branches.find(b => b.id === branchId);
                  
                  if (!branch || branchUsers.length === 0) return null;

                  const isExpanded = expandedBranches.has(branchId);

                  return (
                    <Collapsible
                      key={branchId}
                      open={isExpanded}
                      onOpenChange={() => toggleBranch(branchId)}
                      className="border rounded-lg"
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between w-full p-4 hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                            <Building2 className="h-5 w-5 text-blue-600" />
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold">{branch.name}</h3>
                              {branch.code !== 'N/A' && (
                                <Badge variant="outline" className="text-xs">{branch.code}</Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {branchUsers.length} user{branchUsers.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4">
                          <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Roles</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branchUsers.map((u) => {
                            // Filter roles to show only roles for this branch
                            const branchRoles = branchId === 'no-branch' 
                              ? u.roles.filter(r => !r.branch_id)
                              : u.roles.filter(r => r.branch_id === branchId);
                            
                            return (
                              <TableRow key={u.id}>
                                <TableCell>
                                  <div className="font-medium">{u.name}</div>
                                  <div className="text-sm text-muted-foreground">{u.email}</div>
                                  {u.phone && (
                                    <div className="text-xs text-muted-foreground">{u.phone}</div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-2">
                                    {branchRoles.length === 0 ? (
                                      <Badge variant="outline" className="text-xs">
                                        No Role in This Branch
                                      </Badge>
                                    ) : (
                                      branchRoles.map((roleBranch, index) => (
                                        <Badge key={index} variant={getRoleVariant(roleBranch.role)} className="text-xs">
                                          <div className="flex items-center gap-1">
                                            {getRoleIcon(roleBranch.role)}
                                            {getRoleDisplayName(roleBranch.role)}
                                          </div>
                                        </Badge>
                                      ))
                                    )}
                                  </div>
                                </TableCell>
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
                            );
                          })}
                        </TableBody>
                      </Table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            ) : (
              // Simple list view (for branch filter or branch admin)
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Roles & Branches</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-sm text-muted-foreground">{u.email}</div>
                          {u.phone && (
                            <div className="text-xs text-muted-foreground">{u.phone}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            {u.roles.length === 0 ? (
                              <Badge variant="outline" className="text-xs">
                                No Role Assigned
                              </Badge>
                            ) : (
                              u.roles.map((roleBranch, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <Badge variant={getRoleVariant(roleBranch.role)} className="text-xs">
                                    <div className="flex items-center gap-1">
                                      {getRoleIcon(roleBranch.role)}
                                      {getRoleDisplayName(roleBranch.role)}
                                    </div>
                                  </Badge>
                                  {roleBranch.branch_name ? (
                                    <Badge variant="secondary" className="text-xs">
                                      {roleBranch.branch_name}
                                      {roleBranch.branch_code && ` (${roleBranch.branch_code})`}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      All Branches
                                    </Badge>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </TableCell>
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
                              {canManageRoles && (
                                <DropdownMenuItem onClick={() => openAssignRoleDialog(u)}>
                                  <Crown className="mr-2 h-4 w-4" />
                                  Assign/Change Role
                                </DropdownMenuItem>
                              )}
                              {canSeeAllUsers && (
                                <DropdownMenuItem onClick={() => handleDeleteUser(u.id)} className="text-red-500">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete User
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
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
                <Select 
                  value={branchForRole} 
                  onValueChange={setBranchForRole}
                  disabled={!canSeeAllUsers && isBranchSystemAdmin && !!selectedBranch}
                >
                  <SelectTrigger id="branch-assign">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {!canSeeAllUsers && isBranchSystemAdmin && selectedBranch ? (
                      // Branch admin: Only show their branch
                      <SelectItem value={selectedBranch.id}>
                        {selectedBranch.name} ({selectedBranch.code})
                      </SelectItem>
                    ) : (
                      // System admin: Show all branches
                      branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {!canSeeAllUsers && isBranchSystemAdmin && selectedBranch && (
                  <p className="text-xs text-muted-foreground">
                    You can only assign roles within your branch ({selectedBranch.name}).
                  </p>
                )}
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