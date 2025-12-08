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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Search, 
  Filter, 
  Save, 
  Bookmark, 
  Trash2, 
  Share2,
  X,
  Package,
  Calendar,
  DollarSign,
  Building2,
  TrendingDown,
  TrendingUp,
  Plus,
  Edit
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface StockItem {
  id: string
  product_name: string
  batch_number: string | null
  expiry_date: string
  quantity: number
  unit_price: number
  branch_id: string | null
  status: string
  created_at: string
  updated_at: string
  branch_name?: string
  days_to_expiry?: number
  risk_level?: string
}

interface SavedSearch {
  id: string
  name: string
  description: string | null
  search_criteria: any
  is_shared: boolean
  shared_with_branch_id: string | null
  created_at: string
  last_used_at: string | null
  use_count: number
}

interface SearchCriteria {
  searchTerm: string
  branchIds: string[]
  statuses: string[]
  minQuantity: number | null
  maxQuantity: number | null
  minPrice: number | null
  maxPrice: number | null
  expiryDateFrom: string | null
  expiryDateTo: string | null
  riskLevels: string[]
  batchNumber: string | null
  createdDateFrom: string | null
  createdDateTo: string | null
}

const AdvancedSearch: React.FC = () => {
  const { selectedBranch, isSystemAdmin, isRegionalManager, branches } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess } = useUserRole()
  const { toast } = useToast()
  
  const [loading, setLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<StockItem[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showSavedSearches, setShowSavedSearches] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [searchDescription, setSearchDescription] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [sharedBranchId, setSharedBranchId] = useState<string | null>(null)

  const [criteria, setCriteria] = useState<SearchCriteria>({
    searchTerm: '',
    branchIds: [],
    statuses: [],
    minQuantity: null,
    maxQuantity: null,
    minPrice: null,
    maxPrice: null,
    expiryDateFrom: null,
    expiryDateTo: null,
    riskLevels: [],
    batchNumber: null,
    createdDateFrom: null,
    createdDateTo: null
  })

  const canSearchAcrossBranches = isSystemAdmin || isRegionalManager
  const availableBranches = canSearchAcrossBranches ? branches : selectedBranch ? [selectedBranch] : []

  useEffect(() => {
    fetchSavedSearches()
  }, [user])

  const fetchSavedSearches = async () => {
    if (!user) return

    try {
      // Build query for saved searches
      let query = supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)

      const { data: userSearches, error: userError } = await query

      if (userError) throw userError

      // Get shared searches
      let sharedQuery = supabase
        .from('saved_searches')
        .select('*')
        .eq('is_shared', true)
        .neq('user_id', user.id)

      if (selectedBranch) {
        sharedQuery = sharedQuery.or(`shared_with_branch_id.is.null,shared_with_branch_id.eq.${selectedBranch.id}`)
      } else {
        sharedQuery = sharedQuery.is('shared_with_branch_id', null)
      }

      const { data: sharedSearches, error: sharedError } = await sharedQuery

      if (sharedError) throw sharedError
      
      // Combine user searches with shared searches
      const combinedData = [
        ...(userSearches || []),
        ...(sharedSearches || [])
      ]

      setSavedSearches(combinedData || [])
    } catch (error: any) {
      console.error('Error fetching saved searches:', error)
    }
  }

  const performSearch = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('stock_items')
        .select(`
          *,
          branches(name)
        `)

      // Search term
      if (criteria.searchTerm) {
        query = query.ilike('product_name', `%${criteria.searchTerm}%`)
      }

      // Branch filter
      if (criteria.branchIds.length > 0) {
        query = query.in('branch_id', criteria.branchIds)
      } else if (!canSearchAcrossBranches && selectedBranch) {
        query = query.eq('branch_id', selectedBranch.id)
      }

      // Status filter
      if (criteria.statuses.length > 0) {
        query = query.in('status', criteria.statuses)
      }

      // Quantity range
      if (criteria.minQuantity !== null) {
        query = query.gte('quantity', criteria.minQuantity)
      }
      if (criteria.maxQuantity !== null) {
        query = query.lte('quantity', criteria.maxQuantity)
      }

      // Price range
      if (criteria.minPrice !== null) {
        query = query.gte('unit_price', criteria.minPrice)
      }
      if (criteria.maxPrice !== null) {
        query = query.lte('unit_price', criteria.maxPrice)
      }

      // Batch number
      if (criteria.batchNumber) {
        query = query.ilike('batch_number', `%${criteria.batchNumber}%`)
      }

      // Date ranges
      if (criteria.expiryDateFrom) {
        query = query.gte('expiry_date', criteria.expiryDateFrom)
      }
      if (criteria.expiryDateTo) {
        query = query.lte('expiry_date', criteria.expiryDateTo)
      }
      if (criteria.createdDateFrom) {
        query = query.gte('created_at', criteria.createdDateFrom)
      }
      if (criteria.createdDateTo) {
        query = query.lte('created_at', criteria.createdDateTo)
      }

      const { data, error } = await query
        .order('product_name', { ascending: true })
        .limit(500)

      if (error) throw error

      // Calculate additional fields and apply risk level filter
      // Filter out items with quantity 0 (completed/out of stock items)
      const activeItems = (data || []).filter(item => (item.quantity || 0) > 0)
      let itemsWithCalculations = activeItems.map(item => {
        const daysToExpiry = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        let riskLevel = 'very-low'
        if (daysToExpiry < 0) riskLevel = 'expired'
        else if (daysToExpiry <= 30) riskLevel = 'critical'
        else if (daysToExpiry <= 60) riskLevel = 'high'
        else if (daysToExpiry <= 90) riskLevel = 'medium-high'
        else if (daysToExpiry <= 120) riskLevel = 'medium-high'
        else if (daysToExpiry <= 180) riskLevel = 'medium'
        else if (daysToExpiry <= 365) riskLevel = 'low'
        else riskLevel = 'very-low'

        return {
          ...item,
          branch_name: item.branches?.name || 'Unknown Branch',
          days_to_expiry: daysToExpiry,
          risk_level: riskLevel
        }
      })

      // Filter by risk level if specified
      if (criteria.riskLevels.length > 0) {
        itemsWithCalculations = itemsWithCalculations.filter(item => 
          criteria.riskLevels.includes(item.risk_level)
        )
      }

      setSearchResults(itemsWithCalculations)
    } catch (error: any) {
      console.error('Error performing search:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to perform search',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const saveSearch = async () => {
    if (!user || !searchName.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a name for the search',
        variant: 'destructive'
      })
      return
    }

    try {
      const { error } = await supabase
        .from('saved_searches')
        .insert({
          user_id: user.id,
          name: searchName,
          description: searchDescription || null,
          search_criteria: criteria,
          is_shared: isShared,
          shared_with_branch_id: isShared && sharedBranchId ? sharedBranchId : null
        })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Search saved successfully'
      })

      setShowSaveDialog(false)
      setSearchName('')
      setSearchDescription('')
      setIsShared(false)
      setSharedBranchId(null)
      fetchSavedSearches()
    } catch (error: any) {
      console.error('Error saving search:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to save search',
        variant: 'destructive'
      })
    }
  }

  const loadSavedSearch = async (savedSearch: SavedSearch) => {
    setCriteria(savedSearch.search_criteria)
    
    // Update usage
    try {
      await supabase.rpc('update_saved_search_usage', { p_search_id: savedSearch.id })
      fetchSavedSearches()
    } catch (error) {
      console.error('Error updating search usage:', error)
    }
    
    setShowSavedSearches(false)
  }

  const deleteSavedSearch = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved search?')) return

    try {
      const { error } = await supabase
        .from('saved_searches')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Search deleted successfully'
      })
      fetchSavedSearches()
    } catch (error: any) {
      console.error('Error deleting search:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete search',
        variant: 'destructive'
      })
    }
  }

  const clearFilters = () => {
    setCriteria({
      searchTerm: '',
      branchIds: [],
      statuses: [],
      minQuantity: null,
      maxQuantity: null,
      minPrice: null,
      maxPrice: null,
      expiryDateFrom: null,
      expiryDateTo: null,
      riskLevels: [],
      batchNumber: null,
      createdDateFrom: null,
      createdDateTo: null
    })
    setSearchResults([])
  }

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (criteria.searchTerm) count++
    if (criteria.branchIds.length > 0) count++
    if (criteria.statuses.length > 0) count++
    if (criteria.minQuantity !== null || criteria.maxQuantity !== null) count++
    if (criteria.minPrice !== null || criteria.maxPrice !== null) count++
    if (criteria.expiryDateFrom || criteria.expiryDateTo) count++
    if (criteria.riskLevels.length > 0) count++
    if (criteria.batchNumber) count++
    if (criteria.createdDateFrom || criteria.createdDateTo) count++
    return count
  }, [criteria])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold">
              <Search className="h-6 w-6" />
              Advanced Search
            </CardTitle>
            <CardDescription>
              Search across {canSearchAcrossBranches ? 'all branches' : 'your branch'} with advanced filters
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSavedSearches(true)}
            >
              <Bookmark className="mr-2 h-4 w-4" />
              Saved Searches ({savedSearches.length})
            </Button>
            {activeFiltersCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                <X className="mr-2 h-4 w-4" />
                Clear ({activeFiltersCount})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Basic Search */}
            <div className="space-y-2">
              <Label htmlFor="search-term">Search Term</Label>
              <Input
                id="search-term"
                placeholder="Search by product name..."
                value={criteria.searchTerm}
                onChange={(e) => setCriteria({ ...criteria, searchTerm: e.target.value })}
              />
            </div>

            {/* Advanced Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Branch Filter (only for admins) */}
              {canSearchAcrossBranches && (
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select
                    value={criteria.branchIds.length > 0 ? criteria.branchIds[0] : 'all'}
                    onValueChange={(value) => {
                      setCriteria({
                        ...criteria,
                        branchIds: value === 'all' ? [] : [value]
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {availableBranches.map(branch => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status Filter */}
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex flex-wrap gap-2">
                  {['available', 'low_stock', 'out_of_stock', 'moved'].map(status => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${status}`}
                        checked={criteria.statuses.includes(status)}
                        onCheckedChange={(checked) => {
                          setCriteria({
                            ...criteria,
                            statuses: checked
                              ? [...criteria.statuses, status]
                              : criteria.statuses.filter(s => s !== status)
                          })
                        }}
                      />
                      <Label htmlFor={`status-${status}`} className="text-sm font-normal">
                        {status.replace('_', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Level Filter */}
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <div className="flex flex-wrap gap-2">
                  {['expired', 'critical', 'high', 'medium-high', 'medium', 'low', 'very-low'].map(level => (
                    <div key={level} className="flex items-center space-x-2">
                      <Checkbox
                        id={`risk-${level}`}
                        checked={criteria.riskLevels.includes(level)}
                        onCheckedChange={(checked) => {
                          setCriteria({
                            ...criteria,
                            riskLevels: checked
                              ? [...criteria.riskLevels, level]
                              : criteria.riskLevels.filter(l => l !== level)
                          })
                        }}
                      />
                      <Label htmlFor={`risk-${level}`} className="text-sm font-normal">
                        {level.replace('-', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quantity Range */}
              <div className="space-y-2">
                <Label>Quantity Range</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={criteria.minQuantity || ''}
                    onChange={(e) => setCriteria({
                      ...criteria,
                      minQuantity: e.target.value ? parseInt(e.target.value) : null
                    })}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={criteria.maxQuantity || ''}
                    onChange={(e) => setCriteria({
                      ...criteria,
                      maxQuantity: e.target.value ? parseInt(e.target.value) : null
                    })}
                  />
                </div>
              </div>

              {/* Price Range */}
              <div className="space-y-2">
                <Label>Price Range</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    step="0.01"
                    value={criteria.minPrice || ''}
                    onChange={(e) => setCriteria({
                      ...criteria,
                      minPrice: e.target.value ? parseFloat(e.target.value) : null
                    })}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    step="0.01"
                    value={criteria.maxPrice || ''}
                    onChange={(e) => setCriteria({
                      ...criteria,
                      maxPrice: e.target.value ? parseFloat(e.target.value) : null
                    })}
                  />
                </div>
              </div>

              {/* Expiry Date Range */}
              <div className="space-y-2">
                <Label>Expiry Date Range</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={criteria.expiryDateFrom || ''}
                    onChange={(e) => setCriteria({
                      ...criteria,
                      expiryDateFrom: e.target.value || null
                    })}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="date"
                    value={criteria.expiryDateTo || ''}
                    onChange={(e) => setCriteria({
                      ...criteria,
                      expiryDateTo: e.target.value || null
                    })}
                  />
                </div>
              </div>

              {/* Batch Number */}
              <div className="space-y-2">
                <Label htmlFor="batch-number">Batch Number</Label>
                <Input
                  id="batch-number"
                  placeholder="Search by batch number..."
                  value={criteria.batchNumber || ''}
                  onChange={(e) => setCriteria({
                    ...criteria,
                    batchNumber: e.target.value || null
                  })}
                />
              </div>
            </div>

            {/* Search Actions */}
            <div className="flex items-center gap-2">
              <Button onClick={performSearch} disabled={loading}>
                <Search className="mr-2 h-4 w-4" />
                {loading ? 'Searching...' : 'Search'}
              </Button>
              {searchResults.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDialog(true)}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Search
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    {canSearchAcrossBranches && <TableHead>Branch</TableHead>}
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Days to Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      {canSearchAcrossBranches && (
                        <TableCell>{item.branch_name}</TableCell>
                      )}
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>${item.unit_price.toFixed(2)}</TableCell>
                      <TableCell>{format(new Date(item.expiry_date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {item.days_to_expiry && item.days_to_expiry < 0 ? (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          )}
                          <span>
                            {item.days_to_expiry && item.days_to_expiry < 0
                              ? `${Math.abs(item.days_to_expiry)} days expired`
                              : `${item.days_to_expiry} days left`
                            }
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.risk_level === 'expired' ? 'destructive' :
                            item.risk_level === 'critical' ? 'destructive' :
                            item.risk_level === 'high' ? 'default' :
                            'secondary'
                          }
                        >
                          {item.risk_level}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Search Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Search</DialogTitle>
            <DialogDescription>
              Save this search criteria for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="search-name">Search Name *</Label>
              <Input
                id="search-name"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g., Low Stock Items"
              />
            </div>
            <div>
              <Label htmlFor="search-description">Description</Label>
              <Input
                id="search-description"
                value={searchDescription}
                onChange={(e) => setSearchDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-search"
                checked={isShared}
                onCheckedChange={(checked) => setIsShared(checked as boolean)}
              />
              <Label htmlFor="share-search">Share with branch users</Label>
            </div>
            {isShared && (
              <div>
                <Label>Share with Branch</Label>
                <Select
                  value={sharedBranchId || ''}
                  onValueChange={setSharedBranchId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveSearch}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Searches Dialog */}
      <Dialog open={showSavedSearches} onOpenChange={setShowSavedSearches}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Searches</DialogTitle>
            <DialogDescription>
              Load or manage your saved search queries
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {savedSearches.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No saved searches yet
              </div>
            ) : (
              savedSearches.map((search) => (
                <Card key={search.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{search.name}</h4>
                          {search.is_shared && (
                            <Badge variant="outline">
                              <Share2 className="h-3 w-3 mr-1" />
                              Shared
                            </Badge>
                          )}
                        </div>
                        {search.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {search.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Used {search.use_count} times</span>
                          {search.last_used_at && (
                            <span>Last used: {format(new Date(search.last_used_at), 'MMM dd, yyyy')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadSavedSearch(search)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteSavedSearch(search.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AdvancedSearch

