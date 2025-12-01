import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Shield, 
  Users,
  Phone,
  Mail,
  Trash2,
  UserX
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface Dispenser {
  user_id: string;
  name: string;
  phone?: string;
  role?: string;
}

const Dispensers = () => {
  const { user, signOut } = useAuth()
  const { hasAdminAccess, loading: roleLoading } = useUserRole()
  const { toast } = useToast()

  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDispensers = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('users_with_roles')
        .select('user_id, name, phone, role')
        .eq('role', 'dispenser')
      
      if (error) {
        console.error('Error fetching dispensers:', error)
        setError('Failed to fetch dispensers')
        setDispensers([])
      } else {
        console.log('Fetched dispensers:', data)
        setDispensers(data || [])
      }
    } catch (err) {
      console.error('Exception fetching dispensers:', err)
      setError('Failed to fetch dispensers')
      setDispensers([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchDispensers()
  }, [])

  // No need to filter again since we're already filtering in the query
  const filteredDispensers = dispensers

  const handleDisableDispenser = async (id: string) => {
    // Implement disable logic here
    toast({ title: 'Info', description: 'Disable action not implemented.' })
  }

  const handleDeleteDispenser = async (id: string) => {
    // Implement delete logic here
    toast({ title: 'Info', description: 'Delete action not implemented.' })
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Please log in to access dispensers.</p>
        </div>
      </div>
    )
  }

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="border-b border-slate-700 bg-slate-800 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">Dispenser Management</h1>
              <p className="text-slate-400">Manage dispensers and their login credentials</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <Alert className="bg-slate-800 border-slate-700">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-slate-300">
              Access denied. Only administrators and regional managers can access dispenser management.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Loading dispensers...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800 px-6 py-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dispenser Management</h1>
            <p className="text-slate-400">Manage dispensers and their login credentials</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="text-slate-300">{dispensers.length} Dispensers</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-green-400" />
                <span className="text-slate-300">{dispensers.length} Accounts</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="text-white border-slate-600 hover:bg-slate-700"
              onClick={fetchDispensers}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Dispenser Accounts Section */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Users className="h-6 w-6 text-blue-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Dispenser Accounts</h2>
                <p className="text-slate-400 text-sm">Manage dispensers and their account credentials</p>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-slate-700 rounded-lg mb-4 text-sm font-medium text-slate-300">
              <div>Dispenser Name</div>
              <div>Contact</div>
              <div>Role</div>
              <div>Actions</div>
            </div>

            {/* Table Content */}
            {filteredDispensers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">No dispensers found.</p>
                <p className="text-slate-500 text-sm mt-2">If you expect to see dispensers, check that their roles in auth.users match the allowed list in your backend trigger/view.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDispensers.map((d) => (
                  <div key={d.user_id} className="grid grid-cols-4 gap-4 py-4 px-4 bg-slate-750 rounded-lg border border-slate-600 hover:bg-slate-700 transition-colors">
                    <div className="flex flex-col">
                      <span className="font-medium text-white">{d.name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-300">{d.phone || 'N/A'}</span>
                      </div>
                    </div>
                    <div>
                      <Badge className="bg-green-600 text-white">
                        {d.role || 'dispenser'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500" onClick={() => handleDisableDispenser(d.user_id)}>
                        <UserX className="h-4 w-4 mr-1" />
                        Disable
                      </Button>
                      <Button variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => handleDeleteDispenser(d.user_id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Dispensers
