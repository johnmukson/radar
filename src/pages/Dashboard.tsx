import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, AlertTriangle, CalendarDays, Edit, Crown, Settings, Package, Users, Trash2, Download } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import StockList from '@/components/StockList'
import AdminManager from '@/components/AdminManager'
import EmergencyManager from '@/components/EmergencyManager'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStockAdjuster } from '@/contexts/StockAdjusterContext'
import { supabase } from '@/integrations/supabase/client'
import HighValueItems from '@/components/dashboard/HighValueItems'
import ProductSearch from '@/components/ProductSearch'

const Dashboard = () => {
  const { user } = useAuth();
  const { hasAdminAccess, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'list' | 'admin' | 'emergency'>('list');

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
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
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="text-sm text-muted-foreground">
            Welcome, {user?.email}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        
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
