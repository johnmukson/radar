import React from 'react'
import { useBranch } from '@/contexts/BranchContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2 } from 'lucide-react'
import BranchSettings from '@/components/settings/BranchSettings'
import BranchNotificationPreferences from '@/components/settings/BranchNotificationPreferences'
import BranchActivityLogs from '@/components/activity/BranchActivityLogs'
import ImportTemplateManager from '@/components/templates/ImportTemplateManager'
import WhatsAppPreferences from '@/components/notifications/WhatsAppPreferences'
import WhatsAppHistory from '@/components/notifications/WhatsAppHistory'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings as SettingsIcon, Bell, Activity, FileText, MessageSquare, History } from 'lucide-react'

const Settings: React.FC = () => {
  const { selectedBranch } = useBranch()

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="bg-card border-b p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
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
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {!selectedBranch ? (
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground p-8">
                Please select a branch to view settings.
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="settings" className="w-full space-y-6">
            <TabsList>
              <TabsTrigger value="settings">
                <SettingsIcon className="mr-2 h-4 w-4" />
                Branch Settings
              </TabsTrigger>
              <TabsTrigger value="notifications">
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity className="mr-2 h-4 w-4" />
                Activity Logs
              </TabsTrigger>
              <TabsTrigger value="templates">
                <FileText className="mr-2 h-4 w-4" />
                Import Templates
              </TabsTrigger>
              <TabsTrigger value="whatsapp">
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="space-y-6">
              <BranchSettings />
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <BranchNotificationPreferences />
            </TabsContent>

            <TabsContent value="activity" className="space-y-6">
              <BranchActivityLogs />
            </TabsContent>

            <TabsContent value="templates" className="space-y-6">
              <ImportTemplateManager />
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-6">
              <Tabs defaultValue="preferences" className="w-full">
                <TabsList>
                  <TabsTrigger value="preferences">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Preferences
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="mr-2 h-4 w-4" />
                    History
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="preferences" className="mt-6">
                  <WhatsAppPreferences />
                </TabsContent>
                <TabsContent value="history" className="mt-6">
                  <WhatsAppHistory />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  )
}

export default Settings
