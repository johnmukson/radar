import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Star, Phone, Clock } from 'lucide-react'
import { format } from 'date-fns'

interface DispenserPerformance {
  id: string
  name: string
  branch: string
  status: string
  total_assignments: number
  completed_assignments: number
  completion_rate: number
  last_active: string | null
  whatsapp_number: string | null
}

interface DispenserPerformanceListProps {
  data: DispenserPerformance[]
  hasSystemAccess: boolean
}

const DispenserPerformanceList = ({ data, hasSystemAccess }: DispenserPerformanceListProps) => {
  const getPerformanceBadge = (rate: number) => {
    if (rate >= 90) return { variant: 'default' as const, color: 'text-green-700', text: 'Excellent' }
    if (rate >= 75) return { variant: 'secondary' as const, color: 'text-blue-700', text: 'Good' }
    if (rate >= 50) return { variant: 'outline' as const, color: 'text-yellow-700', text: 'Average' }
    return { variant: 'destructive' as const, color: 'text-red-700', text: 'Poor' }
  }

  const getStarRating = (rate: number) => {
    const stars = Math.round((rate / 100) * 5)
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < stars ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ))
  }

  const sortedData = [...data].sort((a, b) => b.completion_rate - a.completion_rate)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Dispenser Performance Rankings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedData.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No dispenser performance data available</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedData.map((dispenser, index) => {
              const performanceBadge = getPerformanceBadge(dispenser.completion_rate)
              return (
                <Card key={dispenser.id} className="w-full shadow-md">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                          index === 0 ? 'bg-yellow-500' :
                          index === 1 ? 'bg-gray-400' :
                          index === 2 ? 'bg-orange-500' : 'bg-gray-600'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-base">{dispenser.name}</div>
                          <Badge variant="outline">{dispenser.branch}</Badge>
                        </div>
                      </div>
                      <Badge variant={performanceBadge.variant} className={performanceBadge.color}>
                        {performanceBadge.text}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Total Tasks:</span> {dispenser.total_assignments}
                        <span className="font-semibold ml-4">Completed:</span> <span className="text-green-600 font-medium">{dispenser.completed_assignments}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Completion Rate:</span>
                        <span className="font-bold text-lg">{dispenser.completion_rate}%</span>
                        <div className="flex items-center gap-1 ml-2">{getStarRating(dispenser.completion_rate)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Contact:</span>
                        {dispenser.whatsapp_number ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            <span className="font-mono">{dispenser.whatsapp_number}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No contact</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Last Active:</span>
                        {dispenser.last_active ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3" />
                            <span>{format(new Date(dispenser.last_active), 'MMM dd, HH:mm')}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Never</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default DispenserPerformanceList
