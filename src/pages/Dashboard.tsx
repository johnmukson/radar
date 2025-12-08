import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { useBranch } from '@/contexts/BranchContext'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, AlertTriangle, CalendarDays, Edit, Crown, Settings, Package, Users, Trash2, Download, Building2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import StockList from '@/components/StockList'
import AdminManager from '@/components/AdminManager'
import EmergencyManager from '@/components/EmergencyManager'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStockAdjuster } from '@/contexts/StockAdjusterContext'
import { supabase } from '@/integrations/supabase/client'
import HighValueItems from '@/components/dashboard/HighValueItems'
import BranchAnalytics from '@/components/dashboard/BranchAnalytics'
import CrossBranchReport from '@/components/reports/CrossBranchReport'
import ProductSearch from '@/components/ProductSearch'
import { Badge } from '@/components/ui/badge'

const Dashboard = () => {
  const { user } = useAuth();
  const { hasAdminAccess, userRole, loading: roleLoading } = useUserRole();
  const { selectedBranch } = useBranch();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'list' | 'search' | 'admin' | 'emergency'>('list');

  useEffect(() => {
    if (location.state?.activeTab) {
      const tab = location.state.activeTab;
      // Only set valid tabs, reset to 'list' for removed tabs
      if (['list', 'search', 'admin', 'emergency'].includes(tab)) {
        setActiveTab(tab);
      } else {
        setActiveTab('list');
      }
    }
  }, [location.state]);

  if (roleLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Loading user data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="bg-card border-b p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            {selectedBranch && (
              <div className="flex items-center gap-2 mt-1">
                <Building2 className="h-4 w-4 text-blue-400" />
                <Badge variant="outline" className="text-xs">
                  {selectedBranch.name} ({selectedBranch.code})
                  {selectedBranch.region && ` - ${selectedBranch.region}`}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">
              Welcome, {user?.email}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* Cross-Branch Report Section (System Admin & Regional Manager Only) */}
        {(userRole === 'system_admin' || userRole === 'regional_manager') && (
          <CrossBranchReport />
        )}
        
        {/* Branch Analytics Section */}
        <BranchAnalytics />
        
        {/* High Value Items Section */}
        <HighValueItems />

        {/* Tab-based Navigation */}
        <div className="flex items-center border-b">
          <button onClick={() => setActiveTab('list')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'list' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}>
            Stock List
          </button>
          <button onClick={() => setActiveTab('search')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'search' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}>
            Product Search
          </button>
          {hasAdminAccess && (
            <>
              <button onClick={() => setActiveTab('emergency')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'emergency' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}>
                Emergency
              </button>

              <button onClick={() => setActiveTab('admin')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'admin' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}>
                Admin Panel
              </button>
            </>
          )}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'list' && <StockList />}
          {activeTab === 'search' && <ProductSearch />}
          {activeTab === 'admin' && hasAdminAccess && <AdminManager />}
          {activeTab === 'emergency' && hasAdminAccess && <EmergencyManager />}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
