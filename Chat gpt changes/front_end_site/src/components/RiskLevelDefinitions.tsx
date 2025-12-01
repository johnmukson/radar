import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react'

const RiskLevelDefinitions = () => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const riskDefinitions = [
    {
      level: 'critical',
      label: 'Critical',
      days: '0-30 days',
      color: 'bg-red-600',
      description: 'Items expiring within 30 days - requires immediate action',
      priority: 1
    },
    {
      level: 'high',
      label: 'High Priority (Priority Degree)',
      days: '31-60 days',
      color: 'bg-orange-500',
      description: 'Items expiring within 31-60 days - this becomes the priority degree in database',
      priority: 2
    },
    {
      level: 'medium-high',
      label: 'Medium-High Priority',
      days: '61-120 days',
      color: 'bg-yellow-500',
      description: 'Items expiring within 61-120 days - medium-high priority',
      priority: 3
    },
    {
      level: 'medium',
      label: 'Medium Priority',
      days: '121-180 days',
      color: 'bg-green-500',
      description: 'Items expiring within 121-180 days - medium priority',
      priority: 4
    },
    {
      level: 'low',
      label: 'Low Priority',
      days: '181-365 days',
      color: 'bg-blue-500',
      description: 'Items expiring within 181-365 days - low priority',
      priority: 5
    },
    {
      level: 'very-low',
      label: 'Very Low Priority',
      days: '365+ days',
      color: 'bg-gray-500',
      description: 'Items expiring after 1 year - very low priority',
      priority: 6
    }
  ]

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Risk Level Definitions
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
        <div className="space-y-3">
          {riskDefinitions.map((risk) => (
            <div key={risk.level} className="flex items-center gap-3 p-3 rounded-lg border">
              <Badge className={`${risk.color} text-white`}>
                {risk.label}
              </Badge>
              <div className="flex-1">
                <div className="font-medium text-sm">{risk.days}</div>
                <div className="text-xs text-muted-foreground">{risk.description}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Priority #{risk.priority}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">Assignment Priority</p>
              <p className="text-blue-700 dark:text-blue-300">
                Items are assigned to dispensers in priority order: Critical → High → Medium-High → Medium → Low → Very Low
              </p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                <strong>Database Mapping:</strong> Critical → Urgent, High → High (Priority Degree), Medium-High → Medium, Medium → Low, Low/Very-Low → Low
              </p>
            </div>
          </div>
        </div>
        </CardContent>
      )}
    </Card>
  )
}

export default RiskLevelDefinitions
