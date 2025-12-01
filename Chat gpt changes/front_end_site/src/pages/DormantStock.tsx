import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { 
  Upload, 
  Package, 
  TrendingDown, 
  AlertTriangle, 
  RefreshCw,
  Filter,
  Download,
  Search,
  BarChart3,
  PieChart,
  TrendingUp,
  DollarSign,
  Calendar,
  Users,
  Building,
  Archive,
  Eye,
  Edit,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ArrowUpDown,
  X
} from 'lucide-react'
import DormantStockFileUpload from '@/components/dormant-stock/DormantStockFileUpload'
import { Tables } from '@/integrations/supabase/types'

type DormantStockItem = Tables<'dormant_stock'>


const DormantStock: React.FC = () => {
  const [dormantStock, setDormantStock] = useState<DormantStockItem[]>([])
  const [filteredStock, setFilteredStock] = useState<DormantStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClassification, setSelectedClassification] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [valueRange, setValueRange] = useState<{min: number, max: number}>({min: 0, max: 200000})
  const [daysRange, setDaysRange] = useState<{min: number, max: number}>({min: 0, max: 365})
  const [qtyRange, setQtyRange] = useState<{min: number, max: number}>({min: 0, max: 1000})
  const [filterNoSales, setFilterNoSales] = useState(false)
  const [showHighValueDetails, setShowHighValueDetails] = useState(false)
  const [showPOMDetails, setShowPOMDetails] = useState(false)
  const [showOTCDetails, setShowOTCDetails] = useState(false)
  const [showPOMOTCDetails, setShowPOMOTCDetails] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadDormantStock()
  }, [])

  useEffect(() => {
    filterStock()
  }, [dormantStock, selectedClassification, searchTerm, valueRange, daysRange, qtyRange, filterNoSales])


  const loadDormantStock = async () => {
    try {
      setLoading(true)
      
      // First check if the table exists by doing a simple query
      const { data, error } = await supabase
        .from('dormant_stock')
        .select('id')
        .limit(1)
      
      if (error) {
        // If table doesn't exist, show a helpful message
        if (error.message.includes('relation "dormant_stock" does not exist')) {
          console.log('Dormant stock table does not exist yet')
          setDormantStock([])
          toast({
            title: "Table Not Found",
            description: "The dormant_stock table doesn't exist yet. Please run the database migration first.",
            variant: "destructive",
          })
          return
        }
        throw error
      }

      // If table exists, load the full data
      const { data: fullData, error: fullError } = await supabase
        .from('dormant_stock')
        .select(`
          *,
          branches!dormant_stock_branch_id_fkey(name, code)
        `)
        .order('created_at', { ascending: false })
      
      if (fullError) throw fullError
      setDormantStock(fullData || [])
    } catch (error: unknown) {
      // Better error message extraction
      let errorMessage = "Failed to load dormant stock data"
      
      if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message
        } else if ('error' in error && typeof error.error === 'string') {
          errorMessage = error.error
        } else if ('details' in error && typeof error.details === 'string') {
          errorMessage = error.details
        } else if ('hint' in error && typeof error.hint === 'string') {
          errorMessage = error.hint
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      console.error('Error loading dormant stock:', errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
      setDormantStock([])
    } finally {
      setLoading(false)
    }
  }

  const filterStock = () => {
    let filtered = dormantStock

    if (selectedClassification && selectedClassification !== 'all') {
      filtered = filtered.filter(item => item.classification === selectedClassification)
    }

    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product_id.toString().includes(searchTerm)
      )
    }

    // Advanced filters
    filtered = filtered.filter(item => 
      item.excess_value >= valueRange.min && item.excess_value <= valueRange.max
    )

    filtered = filtered.filter(item => 
      item.days >= daysRange.min && item.days <= daysRange.max
    )

    filtered = filtered.filter(item => 
      item.excess_qty >= qtyRange.min && item.excess_qty <= qtyRange.max
    )

    // Filter out items with no sales
    if (filterNoSales) {
      filtered = filtered.filter(item => item.sales > 0)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField as keyof DormantStockItem]
      let bVal: any = b[sortField as keyof DormantStockItem]
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    setFilteredStock(filtered)
  }

  const getAnalyticsData = () => {
    // Use dormantStock (all data) for panel counts, filteredStock for other analytics
    const totalValue = dormantStock.reduce((sum, item) => sum + item.excess_value, 0)
    const totalQuantity = dormantStock.reduce((sum, item) => sum + item.excess_qty, 0)
    const pomCount = dormantStock.filter(item => item.classification === 'POM').length
    const otcCount = dormantStock.filter(item => item.classification === 'OTC').length
    const pomOtcCount = dormantStock.filter(item => item.classification === 'POM/OTC').length
    const highValueItems = dormantStock.filter(item => item.excess_value > 50000).length
    const longDormantItems = dormantStock.filter(item => item.days > 180).length
    

    return {
      totalValue,
      totalQuantity,
      pomCount,
      otcCount,
      pomOtcCount,
      highValueItems,
      longDormantItems,
      averageValue: dormantStock.length > 0 ? totalValue / dormantStock.length : 0,
      averageDays: dormantStock.length > 0 ? 
        dormantStock.reduce((sum, item) => sum + item.days, 0) / dormantStock.length : 0
    }
  }

  const getClassificationBadgeVariant = (classification: string) => {
    switch (classification) {
      case 'POM':
        return 'destructive'
      case 'POM/OTC':
        return 'secondary'
      case 'OTC':
        return 'default'
      default:
        return 'outline'
    }
  }

  // Download functions for CSV exports
  const downloadCSV = (data: DormantStock[], filename: string) => {
    const headers = ['ID', 'Product Name', 'Excess Value', 'Excess Qty', 'Sales', 'Days', 'Classification']
    const csvContent = [
      headers.join(','),
      ...data.map(item => [
        item.product_id,
        `"${item.product_name}"`,
        item.excess_value,
        item.excess_qty,
        item.sales,
        item.days,
        item.classification
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadHighValueCSV = () => {
    const highValueItems = dormantStock.filter(item => item.excess_value > 50000)
    downloadCSV(highValueItems, 'high_value_items.csv')
  }

  const downloadPOMCSV = () => {
    const pomItems = dormantStock.filter(item => item.classification === 'POM')
    downloadCSV(pomItems, 'pom_items.csv')
  }

  const downloadOTCCSV = () => {
    const otcItems = dormantStock.filter(item => item.classification === 'OTC')
    downloadCSV(otcItems, 'otc_items.csv')
  }

  const downloadPOMOTCCSV = () => {
    const pomOtcItems = dormantStock.filter(item => item.classification === 'POM/OTC')
    downloadCSV(pomOtcItems, 'pom_otc_items.csv')
  }

  const getTotalValue = () => {
    return filteredStock.reduce((sum, item) => sum + item.excess_value, 0)
  }

  const getTotalQuantity = () => {
    return filteredStock.reduce((sum, item) => sum + item.excess_qty, 0)
  }

  const exportToCSV = () => {
    const headers = ['ID', 'Product Name', 'Excess Value', 'Excess Qty', 'Sales', 'Days', 'Classification']
    const csvContent = [
      headers.join('\t'),
      ...filteredStock.map(item => [
        item.product_id,
        item.product_name,
        item.excess_value,
        item.excess_qty,
        item.sales,
        item.days,
        item.classification
      ].join('\t'))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dormant-stock-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  if (showUpload) {
    return (
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Archive className="h-6 w-6 text-blue-600" />
              Dormant Stock Management
            </h1>
            <p className="text-muted-foreground">Upload and manage dormant stock data</p>
          </div>
          <Button variant="outline" onClick={() => setShowUpload(false)}>
            Back to Dashboard
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <DormantStockFileUpload onUploadComplete={loadDormantStock} />
        </main>
      </div>
    )
  }

  const analytics = getAnalyticsData()

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-6 w-6 text-blue-600" />
            Dormant Stock Management
          </h1>
          <p className="text-muted-foreground">Monitor and manage dormant stock inventory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV} disabled={filteredStock.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Data
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Enhanced Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredStock.length}</div>
              <p className="text-xs text-muted-foreground">
                {dormantStock.length} total in database
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                UGX {analytics.totalValue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Excess stock value
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Value Items</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.highValueItems}
              </div>
              <p className="text-xs text-muted-foreground">
                Items over UGX 50,000
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Collapsible Analytics Sections - Horizontal Panel Format */}
        <div className="space-y-2">
          {/* High Value Items Panel */}
          <div className="bg-gray-800 rounded-lg border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-orange-500" />
                <span className="font-bold text-white">High Value Items: {analytics.highValueItems} items over UGX 50,000</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadHighValueCSV()}
                  className="bg-gray-700 hover:bg-gray-600 text-white"
                >
                  Download CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHighValueDetails(!showHighValueDetails)}
                  className="text-gray-400 hover:text-white"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showHighValueDetails ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            </div>
            
            {showHighValueDetails && (
              <div className="border-t border-gray-700 p-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {dormantStock
                    .filter(item => item.excess_value > 50000)
                    .sort((a, b) => b.excess_value - a.excess_value)
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-white truncate" title={item.product_name}>
                            {item.product_name}
                          </div>
                          <div className="text-sm text-gray-400">
                            ID: {item.product_id} • Qty: {item.excess_qty}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-orange-400">
                            UGX {item.excess_value.toLocaleString()}
                          </div>
                          <Badge variant={getClassificationBadgeVariant(item.classification)}>
                            {item.classification}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* POM Items Panel */}
          <div className="bg-gray-800 rounded-lg border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="font-bold text-white">POM Items: {analytics.pomCount} prescription only medicines</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadPOMCSV()}
                  className="bg-gray-700 hover:bg-gray-600 text-white"
                >
                  Download CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPOMDetails(!showPOMDetails)}
                  className="text-gray-400 hover:text-white"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showPOMDetails ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            </div>
            
            {showPOMDetails && (
              <div className="border-t border-gray-700 p-4">
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {dormantStock.filter(item => item.classification === 'POM').map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm">
                      <span className="truncate flex-1 text-white" title={item.product_name}>
                        {item.product_name}
                      </span>
                      <span className="font-medium ml-2 text-red-400">UGX {item.excess_value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* OTC Items Panel */}
          <div className="bg-gray-800 rounded-lg border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-blue-500" />
                <span className="font-bold text-white">OTC Items: {analytics.otcCount} over the counter medicines</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadOTCCSV()}
                  className="bg-gray-700 hover:bg-gray-600 text-white"
                >
                  Download CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOTCDetails(!showOTCDetails)}
                  className="text-gray-400 hover:text-white"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showOTCDetails ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            </div>
            
            {showOTCDetails && (
              <div className="border-t border-gray-700 p-4">
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {dormantStock.filter(item => item.classification === 'OTC').map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm">
                      <span className="truncate flex-1 text-white" title={item.product_name}>
                        {item.product_name}
                      </span>
                      <span className="font-medium ml-2 text-blue-400">UGX {item.excess_value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* POM/OTC Items Panel */}
          <div className="bg-gray-800 rounded-lg border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-purple-500" />
                <span className="font-bold text-white">POM/OTC Items: {analytics.pomOtcCount} dual classification medicines</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadPOMOTCCSV()}
                  className="bg-gray-700 hover:bg-gray-600 text-white"
                >
                  Download CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPOMOTCDetails(!showPOMOTCDetails)}
                  className="text-gray-400 hover:text-white"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showPOMOTCDetails ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            </div>
            
            {showPOMOTCDetails && (
              <div className="border-t border-gray-700 p-4">
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {dormantStock.filter(item => item.classification === 'POM/OTC').map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm">
                      <span className="truncate flex-1 text-white" title={item.product_name}>
                        {item.product_name}
                      </span>
                      <span className="font-medium ml-2 text-purple-400">UGX {item.excess_value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="data">Data Management</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Enhanced Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters & Search
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  >
                    <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
                    Advanced
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Classification</Label>
                    <Select value={selectedClassification} onValueChange={setSelectedClassification}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="OTC">OTC</SelectItem>
                        <SelectItem value="POM">POM</SelectItem>
                        <SelectItem value="POM/OTC">POM/OTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Product name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="flex items-end">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSelectedClassification('all')
                        setSearchTerm('')
                        setValueRange({min: 0, max: 200000})
                        setDaysRange({min: 0, max: 365})
                        setQtyRange({min: 0, max: 1000})
                        setFilterNoSales(false)
                      }}
                      className="w-full"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  </div>
                </div>

                {showAdvancedFilters && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 border rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label>Value Range (UGX {valueRange.min.toLocaleString()} - UGX {valueRange.max.toLocaleString()})</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min value (UGX)"
                          value={valueRange.min}
                          onChange={(e) => setValueRange(prev => ({...prev, min: Number(e.target.value)}))}
                        />
                        <Input
                          type="number"
                          placeholder="Max value (UGX)"
                          value={valueRange.max}
                          onChange={(e) => setValueRange(prev => ({...prev, max: Number(e.target.value)}))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Days Range ({daysRange.min} - {daysRange.max} days)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min days"
                          value={daysRange.min}
                          onChange={(e) => setDaysRange(prev => ({...prev, min: Number(e.target.value)}))}
                        />
                        <Input
                          type="number"
                          placeholder="Max days"
                          value={daysRange.max}
                          onChange={(e) => setDaysRange(prev => ({...prev, max: Number(e.target.value)}))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Excess Qty Range ({qtyRange.min} - {qtyRange.max})</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min qty"
                          value={qtyRange.min}
                          onChange={(e) => setQtyRange(prev => ({...prev, min: Number(e.target.value)}))}
                        />
                        <Input
                          type="number"
                          placeholder="Max qty"
                          value={qtyRange.max}
                          onChange={(e) => setQtyRange(prev => ({...prev, max: Number(e.target.value)}))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Quick Filters</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDaysRange({min: 0, max: 30})
                            setQtyRange({min: 0, max: 1000})
                          }}
                        >
                          0-30 Days
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDaysRange({min: 180, max: 365})
                            setQtyRange({min: 0, max: 1000})
                          }}
                        >
                          180+ Days
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setValueRange({min: 50000, max: 1000000})
                            setQtyRange({min: 0, max: 1000})
                          }}
                        >
                          High Value
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQtyRange({min: 1, max: 5})
                            setValueRange({min: 0, max: 200000})
                          }}
                        >
                          Low Qty (1-5)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQtyRange({min: 10, max: 1000})
                            setValueRange({min: 0, max: 200000})
                          }}
                        >
                          High Qty (10+)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedClassification('POM')
                            setValueRange({min: 0, max: 200000})
                            setDaysRange({min: 0, max: 365})
                            setQtyRange({min: 0, max: 1000})
                          }}
                        >
                          POM Only
                        </Button>
                        <Button
                          variant={filterNoSales ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFilterNoSales(!filterNoSales)}
                        >
                          {filterNoSales ? "Show No Sales" : "Hide No Sales"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enhanced Data Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Dormant Stock Items</CardTitle>
                  <CardDescription>
                    {filteredStock.length} items found • Total value: UGX {analytics.totalValue.toLocaleString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={loadDormantStock}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  {selectedItems.length > 0 && (
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete ({selectedItems.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredStock.length === 0 && dormantStock.length === 0 ? (
                  <div className="text-center py-8">
                    <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No dormant stock items found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The dormant_stock table may not exist yet. Please run the database migration.
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => window.open('/run-migration.md', '_blank')}
                    >
                      View Migration Instructions
                    </Button>
                  </div>
                ) : filteredStock.length === 0 ? (
                  <div className="text-center py-8">
                    <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No dormant stock items match your filters</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Try adjusting your filters or upload new data
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="cursor-pointer" onClick={() => {
                            setSortField('product_id')
                            setSortDirection(sortField === 'product_id' && sortDirection === 'asc' ? 'desc' : 'asc')
                          }}>
                            <div className="flex items-center gap-2">
                              ID
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead>Product Name</TableHead>
                          <TableHead className="cursor-pointer" onClick={() => {
                            setSortField('excess_value')
                            setSortDirection(sortField === 'excess_value' && sortDirection === 'asc' ? 'desc' : 'asc')
                          }}>
                            <div className="flex items-center gap-2">
                              Excess Value
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => {
                            setSortField('excess_qty')
                            setSortDirection(sortField === 'excess_qty' && sortDirection === 'asc' ? 'desc' : 'asc')
                          }}>
                            <div className="flex items-center gap-2">
                              Excess Qty
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead>Sales</TableHead>
                          <TableHead className="cursor-pointer" onClick={() => {
                            setSortField('days')
                            setSortDirection(sortField === 'days' && sortDirection === 'asc' ? 'desc' : 'asc')
                          }}>
                            <div className="flex items-center gap-2">
                              Days
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead>Classification</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStock.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/50">
                            <TableCell className="font-mono">{item.product_id}</TableCell>
                            <TableCell>
                              <div className="max-w-xs truncate" title={item.product_name}>
                                {item.product_name}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">
                              UGX {item.excess_value.toLocaleString()}
                            </TableCell>
                            <TableCell>{item.excess_qty}</TableCell>
                            <TableCell>{item.sales}</TableCell>
                            <TableCell>{item.days}</TableCell>
                            <TableCell>
                              <Badge variant={getClassificationBadgeVariant(item.classification)}>
                                {item.classification}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Classification Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span>POM</span>
                      </div>
                      <span className="font-semibold">{analytics.pomCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span>OTC</span>
                      </div>
                      <span className="font-semibold">{analytics.otcCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <span>POM/OTC</span>
                      </div>
                      <span className="font-semibold">{analytics.pomOtcCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{analytics.averageValue.toFixed(0)}</div>
                    <div className="text-sm text-muted-foreground">Average Value</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{analytics.averageDays.toFixed(0)}</div>
                    <div className="text-sm text-muted-foreground">Average Days</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{analytics.longDormantItems}</div>
                    <div className="text-sm text-muted-foreground">Long Dormant (180+ days)</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Upload New Data
                  </CardTitle>
                  <CardDescription>
                    Upload CSV or Excel files with dormant stock data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setShowUpload(true)} className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Data File
                  </Button>
                </CardContent>
              </Card>


              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Export Data
                  </CardTitle>
                  <CardDescription>
                    Export filtered data for analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" onClick={exportToCSV} className="w-full" disabled={filteredStock.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default DormantStock
