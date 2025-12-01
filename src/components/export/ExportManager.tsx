import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { 
  Download, 
  FileText, 
  FileSpreadsheet,
  Calendar,
  Building2,
  Package,
  Users,
  ClipboardList,
  Settings,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileJson
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'

interface ExportConfig {
  dataType: 'stock_items' | 'emergency_assignments' | 'activity_logs' | 'weekly_tasks' | 'dormant_stock' | 'all'
  format: 'csv' | 'xlsx' | 'json'
  branchIds: string[]
  dateRange: {
    from: string | null
    to: string | null
  }
  includeFields: string[]
  filters: Record<string, any>
}

interface ScheduledExport {
  id: string
  name: string
  description: string | null
  config: ExportConfig
  schedule: 'daily' | 'weekly' | 'monthly'
  scheduleTime: string
  scheduleDay?: number // For weekly (0-6) or monthly (1-31)
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  created_at: string
}

const ExportManager: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager, branches } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess } = useUserRole()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [scheduledExports, setScheduledExports] = useState<ScheduledExport[]>([])

  const [config, setConfig] = useState<ExportConfig>({
    dataType: 'stock_items',
    format: 'csv',
    branchIds: [],
    dateRange: {
      from: null,
      to: null
    },
    includeFields: [],
    filters: {}
  })

  const canExport = hasAdminAccess || isSystemAdmin || isRegionalManager
  const availableBranches = isSystemAdmin || isRegionalManager ? branches : selectedBranch ? [selectedBranch] : []

  useEffect(() => {
    if (selectedBranch && !isSystemAdmin && !isRegionalManager) {
      setConfig(prev => ({ ...prev, branchIds: [selectedBranch.id] }))
    }
    fetchScheduledExports()
  }, [selectedBranch, isSystemAdmin, isRegionalManager])

  const fetchScheduledExports = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('scheduled_exports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setScheduledExports(data || [])
    } catch (error: any) {
      console.error('Error fetching scheduled exports:', error)
    }
  }

  const exportToCSV = (data: any[], headers: string[], filename: string) => {
    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header] ?? ''
          return `"${String(value).replace(/"/g, '""')}"`
        }).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportToXLSX = (data: any[], headers: string[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(
      data.map(row => {
        const obj: any = {}
        headers.forEach(header => {
          obj[header] = row[header] ?? ''
        })
        return obj
      })
    )
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
    XLSX.writeFile(workbook, filename)
  }

  const exportToJSON = (data: any[], filename: string) => {
    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    if (config.branchIds.length === 0 && !isSystemAdmin && !isRegionalManager) {
      toast({
        title: 'Error',
        description: 'Please select at least one branch',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    setExportProgress({ current: 0, total: 1 })

    try {
      let allData: any[] = []
      const branchesToExport = config.branchIds.length > 0 
        ? availableBranches.filter(b => config.branchIds.includes(b.id))
        : availableBranches

      setExportProgress({ current: 0, total: branchesToExport.length })

      for (let i = 0; i < branchesToExport.length; i++) {
        const branch = branchesToExport[i]
        setExportProgress({ current: i + 1, total: branchesToExport.length })

        let query: any = supabase.from(config.dataType).select('*')

        if (config.dataType !== 'all') {
          query = query.eq('branch_id', branch.id)
        }

        // Apply date range filters
        if (config.dateRange.from) {
          query = query.gte('created_at', config.dateRange.from)
        }
        if (config.dateRange.to) {
          query = query.lte('created_at', config.dateRange.to)
        }

        // Apply additional filters
        Object.entries(config.filters).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
            if (Array.isArray(value)) {
              query = query.in(key, value)
            } else {
              query = query.eq(key, value)
            }
          }
        })

        const { data, error } = await query

        if (error) throw error

        // Add branch info to each record
        const dataWithBranch = (data || []).map(item => ({
          ...item,
          branch_name: branch.name,
          branch_code: branch.code,
          branch_region: branch.region
        }))

        allData = [...allData, ...dataWithBranch]
      }

      // Get headers based on data type and includeFields
      const headers = getHeadersForDataType(config.dataType, config.includeFields)

      // Filter data to only include selected fields
      const filteredData = allData.map(item => {
        const filtered: any = {}
        headers.forEach(header => {
          filtered[header] = item[header] ?? ''
        })
        return filtered
      })

      // Generate filename
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss')
      const branchSuffix = branchesToExport.length === 1 
        ? branchesToExport[0].code 
        : 'all-branches'
      const filename = `${config.dataType}_${branchSuffix}_${timestamp}.${config.format}`

      // Export based on format
      if (config.format === 'csv') {
        exportToCSV(filteredData, headers, filename)
      } else if (config.format === 'xlsx') {
        exportToXLSX(filteredData, headers, filename)
      } else if (config.format === 'json') {
        exportToJSON(filteredData, filename)
      }

      toast({
        title: 'Export Complete',
        description: `Exported ${filteredData.length} records to ${filename}`
      })
    } catch (error: any) {
      console.error('Error exporting data:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to export data',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
      setExportProgress(null)
    }
  }

  const getHeadersForDataType = (dataType: string, includeFields: string[]): string[] => {
    const defaultHeaders: Record<string, string[]> = {
      stock_items: [
        'id', 'product_name', 'batch_number', 'expiry_date', 'quantity', 
        'unit_price', 'status', 'branch_name', 'branch_code', 'branch_region',
        'created_at', 'updated_at'
      ],
      emergency_assignments: [
        'id', 'stock_item_id', 'dispenser_id', 'quantity_assigned', 'status',
        'deadline', 'notes', 'assigned_by', 'branch_name', 'branch_code',
        'created_at', 'updated_at'
      ],
      activity_logs: [
        'id', 'activity_type', 'activity_category', 'action', 'entity_type',
        'description', 'user_id', 'branch_name', 'branch_code', 'created_at'
      ],
      weekly_tasks: [
        'id', 'title', 'description', 'status', 'priority', 'assigned_to',
        'assigned_by', 'deadline', 'branch_name', 'branch_code', 'created_at'
      ],
      dormant_stock: [
        'id', 'product_id', 'product_name', 'excess_value', 'excess_qty',
        'sales', 'days', 'classification', 'branch_name', 'branch_code'
      ],
      all: [
        'id', 'type', 'data', 'branch_name', 'branch_code', 'created_at'
      ]
    }

    const headers = defaultHeaders[dataType] || []
    
    if (includeFields.length > 0 && includeFields.length < headers.length) {
      return headers.filter(h => includeFields.includes(h))
    }
    
    return headers
  }

  const getAvailableFields = (dataType: string): string[] => {
    return getHeadersForDataType(dataType, [])
  }

  const handleSaveSchedule = async () => {
    // This would save to database - for now just show toast
    toast({
      title: 'Scheduled Export',
      description: 'Scheduled export functionality will be implemented with backend support'
    })
    setShowScheduleDialog(false)
  }

  if (!canExport) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to export data.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold">
              <Download className="h-6 w-6" />
              Export Data
            </CardTitle>
            <CardDescription>
              Export data per branch in various formats
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="export" className="w-full">
            <TabsList>
              <TabsTrigger value="export">Export Now</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled Exports</TabsTrigger>
            </TabsList>

            <TabsContent value="export" className="space-y-6">
              {/* Data Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="data-type">Data Type</Label>
                <Select
                  value={config.dataType}
                  onValueChange={(value: any) => {
                    setConfig(prev => ({ 
                      ...prev, 
                      dataType: value,
                      includeFields: []
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock_items">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Stock Items
                      </div>
                    </SelectItem>
                    <SelectItem value="emergency_assignments">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Emergency Assignments
                      </div>
                    </SelectItem>
                    <SelectItem value="activity_logs">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Activity Logs
                      </div>
                    </SelectItem>
                    <SelectItem value="weekly_tasks">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Weekly Tasks
                      </div>
                    </SelectItem>
                    <SelectItem value="dormant_stock">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Dormant Stock
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Format Selection */}
              <div className="space-y-2">
                <Label htmlFor="format">Export Format</Label>
                <Select
                  value={config.format}
                  onValueChange={(value: any) => setConfig(prev => ({ ...prev, format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        CSV
                      </div>
                    </SelectItem>
                    <SelectItem value="xlsx">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        Excel (XLSX)
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4" />
                        JSON
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Branch Selection (for admins) */}
              {(isSystemAdmin || isRegionalManager) && (
                <div className="space-y-2">
                  <Label>Branches</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={config.branchIds.length === availableBranches.length}
                        onCheckedChange={(checked) => {
                          setConfig(prev => ({
                            ...prev,
                            branchIds: checked ? availableBranches.map(b => b.id) : []
                          }))
                        }}
                      />
                      <Label className="font-semibold">Select All</Label>
                    </div>
                    {availableBranches.map(branch => (
                      <div key={branch.id} className="flex items-center space-x-2">
                        <Checkbox
                          checked={config.branchIds.includes(branch.id)}
                          onCheckedChange={(checked) => {
                            setConfig(prev => ({
                              ...prev,
                              branchIds: checked
                                ? [...prev.branchIds, branch.id]
                                : prev.branchIds.filter(id => id !== branch.id)
                            }))
                          }}
                        />
                        <Label className="font-normal">
                          {branch.name} ({branch.code})
                          {branch.region && ` - ${branch.region}`}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date-from">From Date (optional)</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={config.dateRange.from || ''}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, from: e.target.value || null }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-to">To Date (optional)</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={config.dateRange.to || ''}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, to: e.target.value || null }
                    }))}
                  />
                </div>
              </div>

              {/* Field Selection */}
              <div className="space-y-2">
                <Label>Fields to Include (leave empty for all fields)</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                  {getAvailableFields(config.dataType).map(field => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        checked={config.includeFields.length === 0 || config.includeFields.includes(field)}
                        onCheckedChange={(checked) => {
                          setConfig(prev => {
                            const allFields = getAvailableFields(prev.dataType)
                            if (prev.includeFields.length === 0) {
                              // Currently showing all fields, need to initialize with all fields first
                              return {
                                ...prev,
                                includeFields: checked
                                  ? allFields
                                  : allFields.filter(f => f !== field)
                              }
                            } else {
                              return {
                                ...prev,
                                includeFields: checked
                                  ? [...prev.includeFields, field]
                                  : prev.includeFields.filter(f => f !== field)
                              }
                            }
                          })
                        }}
                      />
                      <Label className="font-normal">{field}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Button */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleExport}
                  disabled={loading || (config.branchIds.length === 0 && (isSystemAdmin || isRegionalManager))}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {loading ? 'Exporting...' : 'Export Data'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowScheduleDialog(true)}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Export
                </Button>
              </div>

              {/* Progress */}
              {exportProgress && (
                <div className="space-y-2">
                  <Progress value={(exportProgress.current / exportProgress.total) * 100} />
                  <p className="text-sm text-muted-foreground">
                    Processing {exportProgress.current} of {exportProgress.total} branches...
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="scheduled" className="space-y-4">
              {scheduledExports.length === 0 ? (
                <div className="text-center text-muted-foreground p-8">
                  No scheduled exports. Click "Schedule Export" to create one.
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduledExports.map(exportItem => (
                    <Card key={exportItem.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{exportItem.name}</h4>
                              <Badge variant={exportItem.enabled ? 'default' : 'secondary'}>
                                {exportItem.enabled ? 'Active' : 'Disabled'}
                              </Badge>
                            </div>
                            {exportItem.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {exportItem.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>Type: {exportItem.config.dataType}</span>
                              <span>Format: {exportItem.config.format.toUpperCase()}</span>
                              <span>Schedule: {exportItem.schedule}</span>
                              {exportItem.lastRun && (
                                <span>Last run: {format(new Date(exportItem.lastRun), 'MMM dd, yyyy HH:mm')}</span>
                              )}
                              {exportItem.nextRun && (
                                <span>Next run: {format(new Date(exportItem.nextRun), 'MMM dd, yyyy HH:mm')}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Schedule Export Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Export</DialogTitle>
            <DialogDescription>
              Set up automated exports that run on a schedule
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Scheduled exports require backend implementation. This feature will be available after backend setup.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ExportManager

