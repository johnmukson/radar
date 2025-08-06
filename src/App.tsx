import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CreateUser from "./pages/CreateUser";
import Dashboard from "./pages/Dashboard";
import LedgerBoard from "./pages/LedgerBoard";
import UserManagement from "./pages/UserManagement";
import Dispensers from "./pages/Dispensers";
import DispenserTasks from "./pages/DispenserTasks";
import Assignments from "./pages/Assignments";
import Settings from "./pages/Settings";
import ExpiryManager from "./pages/ExpiryManager";
import NotFound from "./pages/NotFound";
import StockUpload from "./components/StockUpload";
import { ThemeProvider } from "next-themes";
import Analysis from '@/pages/Analysis'
import { StockAdjusterProvider } from '@/contexts/StockAdjusterContext'
import UpdatePassword from "./pages/UpdatePassword";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <StockAdjusterProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <div className="min-h-screen flex w-full">
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  <Route path="/create-user" element={<CreateUser />} />
                  
                  {/* Protected routes with sidebar */}
                  <Route path="/dashboard" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <Dashboard />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/ledger" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <LedgerBoard />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/user-management" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <UserManagement />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/dispensers" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <Dispensers />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/dispenser-tasks" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <DispenserTasks />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/assignments" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <Assignments />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/settings" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <Settings />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/expiry-manager" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <ExpiryManager />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/upload" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <StockUpload />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  <Route path="/analysis" element={
                    <SidebarProvider>
                      <AppSidebar />
                      <SidebarInset className="flex-1">
                        <Analysis />
                      </SidebarInset>
                    </SidebarProvider>
                  } />
                  
                  {/* 404 catch-all route */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
            </BrowserRouter>
          </StockAdjusterProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
