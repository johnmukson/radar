import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { 
  LayoutDashboard, 
  Upload, 
  Users, 
  UserCheck, 
  BarChart3, 
  FileText, 
  AlertTriangle, 
  Settings, 
  UserPlus, 
  Plus,
  BookOpen,
  Package,
  BarChart2,
  LogOut,
  Archive,
  Building2
} from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'
import { useBranch } from '@/contexts/BranchContext'
import { useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import BranchSwitcher from '@/components/BranchSwitcher'

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'dispenser'],
  },
  {
    title: "Upload Data",
    url: "/upload",
    icon: Upload,
    roles: ['admin', 'system_admin', 'branch_system_admin'],
  },
  {
    title: "Assignments",
    url: "/assignments",
    icon: Users,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin'],
  },
  {
    title: "Dispensers",
    url: "/dispensers",
    icon: UserCheck,
    roles: ['admin', 'system_admin', 'branch_system_admin'],
  },
  {
    title: "Dispenser Tasks",
    url: "/dispenser-tasks",
    icon: BarChart3,
    roles: ['admin', 'system_admin', 'branch_system_admin', 'dispenser'],
  },
  {
    title: "Expiry Manager",
    url: "/expiry-manager",
    icon: AlertTriangle,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'dispenser'],
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'dispenser'],
  },
  {
    title: "User Management",
    url: "/user-management",
    icon: Users,
    roles: ['system_admin', 'branch_system_admin'],
  },
  {
    title: "Ledger Board",
    url: "/ledger",
    icon: BookOpen,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'dispenser'],
  },
  {
    title: "Analysis",
    url: "/analysis",
    icon: BarChart2,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin'],
  },
  {
    title: "Dormant Stock",
    url: "/dormant-stock",
    icon: Archive,
    roles: ['admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'dispenser'],
  },
]

type MenuItem = typeof menuItems[number];

export function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userRole, loading } = useUserRole()
  const { selectedBranch, hasMultipleBranches } = useBranch()
  const { state } = useSidebar()

  const handleNavigation = (item: MenuItem) => {
    navigate(item.url);
  }

  const isActive = (item: MenuItem) => {
    return location.pathname === item.url
  }

  // Only show menu items allowed for the user's role
  const filteredMenuItems = menuItems.filter(item =>
    !userRole || item.roles.includes(userRole)
  )

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth' // or navigate to login page
  }

  return (
    <>
      {/* Floating toggle button when sidebar is collapsed */}
      {state === 'collapsed' && (
        <div className="fixed top-4 left-2 z-50 md:z-40">
          <SidebarTrigger />
        </div>
      )}
      <Sidebar className="border-r" collapsible="offcanvas">
        <SidebarHeader className="p-4 flex flex-col gap-3">
          {/* Only show trigger in header if expanded */}
          {state === 'expanded' && (
            <div className="flex items-center gap-2">
              <SidebarTrigger />
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg">Stock Manager</h2>
              <p className="text-sm text-muted-foreground">UGX System</p>
            </div>
          </div>
          
          {/* Branch Context Display */}
          {selectedBranch && state === 'expanded' && (
            <div className="mt-2 pt-3 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={selectedBranch.name}>
                    {selectedBranch.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {selectedBranch.code}
                    </Badge>
                    {selectedBranch.region && (
                      <span className="truncate" title={selectedBranch.region}>
                        • {selectedBranch.region}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Branch Switcher - Only show if user has multiple branches */}
              {hasMultipleBranches && (
                <div className="mt-2">
                  <BranchSwitcher />
                </div>
              )}
            </div>
          )}
          
          {/* Collapsed Branch Display - Show only icon when collapsed */}
          {selectedBranch && state === 'collapsed' && (
            <div className="mt-2 pt-3 border-t flex justify-center">
              <div className="flex flex-col items-center gap-1" title={`${selectedBranch.name} (${selectedBranch.code})`}>
                <Building2 className="w-5 h-5 text-blue-400" />
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {selectedBranch.code}
                </Badge>
              </div>
            </div>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {loading ? (
                  <div className="p-4 text-muted-foreground">Loading...</div>
                ) : filteredMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive(item)}
                      className="w-full justify-start"
                    >
                      <button
                        onClick={() => handleNavigation(item)}
                        className="flex items-center gap-3 w-full"
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarFooter className="p-4">
            <Button variant="outline" className="w-full flex items-center gap-2" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </SidebarFooter>
        </SidebarContent>
      </Sidebar>
    </>
  )
}
