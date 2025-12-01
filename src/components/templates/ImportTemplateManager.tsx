import React, { useState, useEffect } from 'react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { 
  FileText, 
  Upload, 
  Download, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle2,
  XCircle,
  Building2,
  Package,
  Settings,
  FileSpreadsheet,
  AlertCircle,
  CheckSquare,
  X
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'

interface ImportTemplate {
  id: string
  branch_id: string | null
  name: string
  description: string | null
  template_type: 'stock_items' | 'dormant_stock' | 'custom'
  file_format: 'csv' | 'xlsx' | 'xls' | 'tsv'
  column_mapping: Record<string, string>
  default_values: Record<string, any>
  validation_rules: Record<string, any>
  required_columns: string[]
  optional_columns: string[]
  sample_data: any[] | null
  is_shared: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

interface ColumnMapping {
  fileColumn: string
  dbField: string
  required: boolean
  defaultValue?: any
}

const ImportTemplateManager: React.FC = () => {
  const { selectedBranch, isSystemAdmin, branches } = useBranch()
  const { user } = useAuth()
  const { hasAdminAccess } = useUserRole()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<ImportTemplate[]>([])
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ImportTemplate | null>(null)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validationFile, setValidationFile] = useState<File | null>(null)
  const [validationResult, setValidationResult] = useState<any>(null)

  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    template_type: 'stock_items' as 'stock_items' | 'dormant_stock' | 'custom',
    file_format: 'csv' as 'csv' | 'xlsx' | 'xls' | 'tsv',
    column_mapping: {} as Record<string, string>,
    default_values: {} as Record<string, any>,
    validation_rules: {} as Record<string, any>,
    required_columns: [] as string[],
    optional_columns: [] as string[],
    is_shared: false,
    is_default: false
  })

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [availableDbFields, setAvailableDbFields] = useState<string[]>([])

  const canManageTemplates = hasAdminAccess || isSystemAdmin

  useEffect(() => {
    if (selectedBranch && canManageTemplates) {
      fetchTemplates()
    }
  }, [selectedBranch, canManageTemplates])

  useEffect(() => {
    updateAvailableDbFields()
  }, [templateForm.template_type])

  const updateAvailableDbFields = () => {
    const fields: Record<string, string[]> = {
      stock_items: [
        'product_name',
        'batch_number',
        'expiry_date',
        'quantity',
        'unit_price',
        'status',
        'branch_id'
      ],
      dormant_stock: [
        'product_name',
        'excess_value',
        'excess_qty',
        'sales',
        'days',
        'classification'
      ],
      custom: []
    }
    setAvailableDbFields(fields[templateForm.template_type] || [])
  }

  const fetchTemplates = async () => {
    if (!selectedBranch) return

    setLoading(true)
    try {
      let query = supabase
        .from('import_templates')
        .select('*')
        .or(`branch_id.eq.${selectedBranch.id},is_shared.eq.true`)
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      setTemplates(data || [])
    } catch (error: any) {
      console.error('Error fetching templates:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch templates',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm({
      name: '',
      description: '',
      template_type: 'stock_items',
      file_format: 'csv',
      column_mapping: {},
      default_values: {},
      validation_rules: {},
      required_columns: [],
      optional_columns: [],
      is_shared: false,
      is_default: false
    })
    setColumnMappings([])
    setShowTemplateDialog(true)
  }

  const handleEditTemplate = (template: ImportTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      description: template.description || '',
      template_type: template.template_type,
      file_format: template.file_format,
      column_mapping: template.column_mapping,
      default_values: template.default_values,
      validation_rules: template.validation_rules,
      required_columns: template.required_columns,
      optional_columns: template.optional_columns,
      is_shared: template.is_shared,
      is_default: template.is_default
    })
    
    // Convert column_mapping to ColumnMapping format
    const mappings: ColumnMapping[] = Object.entries(template.column_mapping).map(([fileColumn, dbField]) => ({
      fileColumn,
      dbField,
      required: template.required_columns.includes(fileColumn),
      defaultValue: template.default_values[fileColumn]
    }))
    setColumnMappings(mappings)
    setShowTemplateDialog(true)
  }

  const handleSaveTemplate = async () => {
    if (!selectedBranch || !user || !templateForm.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a template name',
        variant: 'destructive'
      })
      return
    }

    if (columnMappings.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one column mapping',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    try {
      // Build column_mapping from columnMappings
      const columnMapping: Record<string, string> = {}
      const requiredColumns: string[] = []
      const optionalColumns: string[] = []
      const defaultValues: Record<string, any> = {}

      columnMappings.forEach(mapping => {
        columnMapping[mapping.fileColumn] = mapping.dbField
        if (mapping.required) {
          requiredColumns.push(mapping.fileColumn)
        } else {
          optionalColumns.push(mapping.fileColumn)
        }
        if (mapping.defaultValue !== undefined && mapping.defaultValue !== '') {
          defaultValues[mapping.fileColumn] = mapping.defaultValue
        }
      })

      const templateData = {
        branch_id: selectedBranch.id,
        name: templateForm.name,
        description: templateForm.description || null,
        template_type: templateForm.template_type,
        file_format: templateForm.file_format,
        column_mapping: columnMapping,
        default_values: defaultValues,
        validation_rules: templateForm.validation_rules,
        required_columns: requiredColumns,
        optional_columns: optionalColumns,
        is_shared: templateForm.is_shared,
        is_default: templateForm.is_default,
        updated_by: user.id
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('import_templates')
          .update(templateData)
          .eq('id', editingTemplate.id)

        if (error) throw error

        toast({
          title: 'Success',
          description: 'Template updated successfully'
        })
      } else {
        const { error } = await supabase
          .from('import_templates')
          .insert({
            ...templateData,
            created_by: user.id
          })

        if (error) throw error

        toast({
          title: 'Success',
          description: 'Template created successfully'
        })
      }

      // If this is set as default, unset other defaults for this branch and type
      if (templateForm.is_default) {
        await supabase
          .from('import_templates')
          .update({ is_default: false })
          .eq('branch_id', selectedBranch.id)
          .eq('template_type', templateForm.template_type)
          .neq('id', editingTemplate?.id || '00000000-0000-0000-0000-000000000000')
      }

      setShowTemplateDialog(false)
      fetchTemplates()
    } catch (error: any) {
      console.error('Error saving template:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to save template',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      const { error } = await supabase
        .from('import_templates')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Template deleted successfully'
      })
      fetchTemplates()
    } catch (error: any) {
      console.error('Error deleting template:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete template',
        variant: 'destructive'
      })
    }
  }

  const handleAddColumnMapping = () => {
    setColumnMappings([
      ...columnMappings,
      {
        fileColumn: '',
        dbField: '',
        required: false
      }
    ])
  }

  const handleRemoveColumnMapping = (index: number) => {
    setColumnMappings(columnMappings.filter((_, i) => i !== index))
  }

  const handleUpdateColumnMapping = (index: number, field: keyof ColumnMapping, value: any) => {
    const updated = [...columnMappings]
    updated[index] = { ...updated[index], [field]: value }
    setColumnMappings(updated)
  }

  const handleValidateFile = async (file?: File) => {
    const fileToValidate = file || validationFile
    if (!fileToValidate) {
      toast({
        title: 'Error',
        description: 'Please select a file first',
        variant: 'destructive'
      })
      return
    }

    try {
      // Read file to get columns
      const fileColumns: string[] = []
      
      if (fileToValidate.name.endsWith('.csv') || fileToValidate.name.endsWith('.tsv')) {
        const text = await fileToValidate.text()
        const delimiter = fileToValidate.name.endsWith('.csv') ? ',' : '\t'
        const lines = text.split('\n')
        if (lines.length > 0) {
          fileColumns.push(...lines[0].split(delimiter).map(col => col.trim().replace(/^"|"$/g, '')))
        }
      } else if (fileToValidate.name.endsWith('.xlsx') || fileToValidate.name.endsWith('.xls')) {
        const arrayBuffer = await fileToValidate.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
        if (jsonData.length > 0) {
          fileColumns.push(...(jsonData[0] as string[]).map(col => String(col || '').trim()))
        }
      }

      if (fileColumns.length === 0) {
        toast({
          title: 'Error',
          description: 'Could not read columns from file',
          variant: 'destructive'
        })
        return
      }

      // Validate against templates
      const validationResults = await Promise.all(
        templates.map(async (template) => {
          try {
            const { data, error } = await supabase.rpc('validate_import_template', {
              p_template_id: template.id,
              p_file_columns: fileColumns
            })
            if (error) throw error
            return { template, validation: data, error: null }
          } catch (error: any) {
            return { 
              template, 
              validation: { valid: false, error: error.message || 'Validation failed' }, 
              error: error.message 
            }
          }
        })
      )

      setValidationResult({
        fileColumns,
        validations: validationResults
      })
      setShowValidationDialog(true)
    } catch (error: any) {
      console.error('Error validating file:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to validate file',
        variant: 'destructive'
      })
    }
  }

  const handleDownloadTemplate = (template: ImportTemplate) => {
    // Generate sample file based on template
    const headers = Object.keys(template.column_mapping)
    const sampleRow = headers.map(header => {
      const dbField = template.column_mapping[header]
      const defaultValue = template.default_values[header]
      if (defaultValue !== undefined) return defaultValue
      
      // Generate sample value based on field type
      if (dbField === 'product_name') return 'Sample Product'
      if (dbField === 'quantity') return '100'
      if (dbField === 'unit_price') return '10.00'
      if (dbField === 'expiry_date') return format(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      if (dbField === 'batch_number') return 'BATCH001'
      return 'Sample'
    })

    if (template.file_format === 'csv' || template.file_format === 'tsv') {
      const delimiter = template.file_format === 'csv' ? ',' : '\t'
      const csvContent = [
        headers.map(h => `"${h}"`).join(delimiter),
        sampleRow.map(v => `"${v}"`).join(delimiter)
      ].join('\n')

      const blob = new Blob([csvContent], { type: `text/${template.file_format}` })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.href = url
      link.setAttribute('download', `${template.name}_template.${template.file_format}`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } else {
      // Excel format
      const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template')
      XLSX.writeFile(workbook, `${template.name}_template.${template.file_format}`)
    }

    toast({
      title: 'Success',
      description: `Template downloaded: ${template.name}_template.${template.file_format}`
    })
  }

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            Please select a branch to manage import templates.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!canManageTemplates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground p-8">
            You do not have permission to manage import templates.
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
              <FileText className="h-6 w-6" />
              Import Templates
            </CardTitle>
            <CardDescription>
              Manage import templates for {selectedBranch.name} ({selectedBranch.code})
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const input = document.getElementById('validate-file-input') as HTMLInputElement
                if (input) {
                  input.value = ''
                  input.click()
                }
              }}
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              Validate File
            </Button>
            <Button onClick={handleCreateTemplate} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
            <input
              id="validate-file-input"
              type="file"
              accept=".csv,.xlsx,.xls,.tsv"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files[0]) {
                  const file = e.target.files[0]
                  setValidationFile(file)
                  // Validate immediately with the file
                  await handleValidateFile(file)
                }
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading && templates.length === 0 ? (
            <div className="text-center p-8">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              No import templates found. Click "New Template" to create one.
            </div>
          ) : (
            <Tabs defaultValue="stock" className="w-full">
              <TabsList>
                <TabsTrigger value="stock">Stock Items</TabsTrigger>
                <TabsTrigger value="dormant">Dormant Stock</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>

              {(['stock', 'dormant', 'custom'] as const).map(type => {
                const typeKey = type === 'stock' ? 'stock_items' : type === 'dormant' ? 'dormant_stock' : 'custom'
                const typeTemplates = templates.filter(t => t.template_type === typeKey)

                return (
                  <TabsContent key={type} value={type} className="space-y-4">
                    {typeTemplates.length === 0 ? (
                      <div className="text-center text-muted-foreground p-8">
                        No {typeKey.replace('_', ' ')} templates found
                      </div>
                    ) : (
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Format</TableHead>
                              <TableHead>Columns</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Last Updated</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {typeTemplates.map((template) => (
                              <TableRow key={template.id}>
                                <TableCell className="font-medium">
                                  {template.name}
                                  {template.is_default && (
                                    <Badge variant="default" className="ml-2">Default</Badge>
                                  )}
                                  {template.is_shared && (
                                    <Badge variant="outline" className="ml-2">Shared</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{template.file_format.toUpperCase()}</Badge>
                                </TableCell>
                                <TableCell>
                                  {Object.keys(template.column_mapping).length} columns
                                </TableCell>
                                <TableCell>
                                  <Badge variant={template.is_default ? 'default' : 'outline'}>
                                    {template.is_default ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {format(new Date(template.updated_at), 'MMM dd, yyyy')}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDownloadTemplate(template)}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditTemplate(template)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteTemplate(template.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                )
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>
              Create or edit an import template with column mappings and validation rules
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="template-name">Template Name *</Label>
                <Input
                  id="template-name"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Standard Stock Import"
                />
              </div>
              <div>
                <Label htmlFor="template-type">Template Type *</Label>
                <Select
                  value={templateForm.template_type}
                  onValueChange={(value: any) => {
                    setTemplateForm({ ...templateForm, template_type: value })
                    setColumnMappings([])
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock_items">Stock Items</SelectItem>
                    <SelectItem value="dormant_stock">Dormant Stock</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="file-format">File Format *</Label>
                <Select
                  value={templateForm.file_format}
                  onValueChange={(value: any) => setTemplateForm({ ...templateForm, file_format: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                    <SelectItem value="xls">Excel (XLS)</SelectItem>
                    <SelectItem value="tsv">TSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4 pt-8">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is-default"
                    checked={templateForm.is_default}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_default: checked as boolean })}
                  />
                  <Label htmlFor="is-default">Set as default</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is-shared"
                    checked={templateForm.is_shared}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_shared: checked as boolean })}
                  />
                  <Label htmlFor="is-shared">Share with other branches</Label>
                </div>
              </div>
            </div>

            {/* Column Mappings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Column Mappings</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddColumnMapping}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Column
                </Button>
              </div>

              {columnMappings.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Add at least one column mapping to define how file columns map to database fields.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2 border rounded p-4">
                  {columnMappings.map((mapping, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <Input
                          placeholder="File column name"
                          value={mapping.fileColumn}
                          onChange={(e) => handleUpdateColumnMapping(index, 'fileColumn', e.target.value)}
                        />
                      </div>
                      <div className="col-span-4">
                        <Select
                          value={mapping.dbField}
                          onValueChange={(value) => handleUpdateColumnMapping(index, 'dbField', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Database field" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableDbFields.map(field => (
                              <SelectItem key={field} value={field}>{field}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Default value"
                          value={mapping.defaultValue || ''}
                          onChange={(e) => handleUpdateColumnMapping(index, 'defaultValue', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <Checkbox
                          checked={mapping.required}
                          onCheckedChange={(checked) => handleUpdateColumnMapping(index, 'required', checked)}
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveColumnMapping(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={loading}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>File Validation Results</DialogTitle>
            <DialogDescription>
              Validation results for: {validationFile?.name}
            </DialogDescription>
          </DialogHeader>
          {validationResult && (
            <div className="space-y-4">
              <div>
                <Label>File Columns ({validationResult.fileColumns.length})</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {validationResult.fileColumns.map((col: string) => (
                    <Badge key={col} variant="outline">{col}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Template Validations</Label>
                <div className="space-y-2 mt-2">
                  {validationResult.validations.map((result: any, index: number) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{result.template.name}</h4>
                              {result.validation?.valid ? (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Valid
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Invalid
                                </Badge>
                              )}
                            </div>
                            {result.validation?.error && (
                              <p className="text-sm text-red-500 mt-1">{result.validation.error}</p>
                            )}
                            {result.validation?.missing_columns && (
                              <div className="mt-2">
                                <p className="text-sm font-semibold">Missing columns:</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {result.validation.missing_columns.map((col: string) => (
                                    <Badge key={col} variant="destructive">{col}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowValidationDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ImportTemplateManager

