import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Mail, Lock, User, Phone, Building, Shield, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { supabase, getAuthRedirectUrl } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { extractErrorMessage } from '@/lib/utils'
import type { Database } from '@/integrations/supabase/types'

type AppRole = Database['public']['Enums']['app_role'];

interface Branch {
  id: string;
  name: string;
  code: string;
}

const UserCreation = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<AppRole>('dispenser')
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])

  // Fetch branches when component mounts
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name, code')
          .eq('status', 'active')
          .order('name')
        
        if (error) throw error
        setBranches(data || [])
      } catch (error) {
        console.error('Error fetching branches:', error)
      }
    }

    fetchBranches()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" })
      return
    }
    if (!phone.trim()) {
      toast({ title: "Error", description: "Phone number is required", variant: "destructive" })
      return
    }
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" })
      return
    }
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" })
      return
    }
    if (!role.trim()) {
      toast({ title: "Error", description: "Role is required", variant: "destructive" })
      return
    }
    
    // Require branch selection for dispensers
    if (role === 'dispenser' && !branchId) {
      toast({ title: "Error", description: "Branch selection is required for dispensers", variant: "destructive" })
      return
    }

    setLoading(true)

    try {
      // 1. Sign up the user with Supabase Auth
      const { data: { user }, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            phone: phone,
          },
          emailRedirectTo: `${getAuthRedirectUrl()}/auth/confirm`
        },
      });

      if (authError) {
        throw new Error(authError.message);
      }
      
      if (!user) {
        throw new Error("User registration failed, please try again.");
      }

      // 2. Assign the user a role with branch_id for dispensers
      const { error: rpcError } = await supabase.rpc('assign_user_role', {
        p_user_id: user.id,
        p_role: role,
        p_branch_id: role === 'dispenser' ? branchId : null, // Assign branch for dispensers only
      });

      if (rpcError) {
        console.error('Failed to assign role, but user was created in auth.users. Manual cleanup might be needed.');
        throw new Error(`Failed to assign role: ${rpcError.message}`);
      }

      toast({
        title: "Success",
        description: "User account created successfully! A confirmation email has been sent. The user must confirm their email before they can log in.",
      })
      
      // Clear form
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setName('')
      setPhone('')
      setRole('dispenser')
      setBranchId('')
      
      // Redirect to auth page after a short delay
      setTimeout(() => {
        navigate('/auth')
      }, 2000)

    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, "Failed to create user account")
      console.error('Create user error:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6 p-4 max-h-[80vh] overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create New User Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (min 6 characters)"
                required
                minLength={6}
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
                required
              />
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as AppRole)
                  // Clear branch selection when role changes
                  if (e.target.value !== 'dispenser') {
                    setBranchId('')
                  }
                }}
                className="w-full p-2 border rounded bg-background text-foreground"
                required
              >
                <option value="dispenser">Dispenser</option>
                <option value="admin">Admin</option>
                <option value="branch_system_admin">Branch System Admin</option>
                <option value="regional_manager">Regional Manager</option>
                <option value="system_admin">System Admin</option>
              </select>
            </div>

            {/* Show branch selection only for dispensers */}
            {role === 'dispenser' && (
              <div>
                <Label htmlFor="branch">Branch *</Label>
                <select
                  id="branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full p-2 border rounded bg-background text-foreground"
                  required
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground mt-1">
                  Dispensers must be assigned to a specific branch
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>

            <div className="text-center">
              <Button variant="link" onClick={() => navigate('/auth')}>
                Back to Login
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default UserCreation
