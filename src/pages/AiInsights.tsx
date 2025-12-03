import React from 'react'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import AiRecommendationsManager from '@/components/ai/AiRecommendationsManager'

const AiInsights = () => {
  const { userRole, loading: roleLoading } = useUserRole()

  if (roleLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-slate-400">Loading user data...</p>
        </div>
      </div>
    )
  }

  // Check if user has access
  if (userRole !== 'regional_manager' && userRole !== 'system_admin') {
    return (
      <div className="flex-1 flex flex-col">
        <header className="bg-card border-b p-4">
          <h1 className="text-2xl font-bold">AI Insights</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You need to be a Regional Manager or System Admin to access AI Insights.
                  Your current role: {userRole || 'Unknown'}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-card border-b p-4">
        <h1 className="text-2xl font-bold">AI Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Get intelligent recommendations and insights for your inventory management
        </p>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <AiRecommendationsManager />
      </main>
    </div>
  )
}

export default AiInsights

