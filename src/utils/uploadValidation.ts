/**
 * Upload Validation Utilities
 * Provides validation functions for stock item uploads
 */

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface StockItemForValidation {
  product_name: string
  quantity: number
  unit_price: number
  expiry_date: string
  branch_id: string
}

export interface ValidationReport {
  item: StockItemForValidation
  productName: ValidationResult
  quantity: ValidationResult
  unitPrice: ValidationResult
  expiryDate: ValidationResult
  overall: ValidationResult
}

/**
 * Validate product name
 */
export function validateProductName(name: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!name || typeof name !== 'string') {
    errors.push('Product name is required')
    return { isValid: false, errors, warnings }
  }

  const trimmed = name.trim()
  
  if (trimmed.length === 0) {
    errors.push('Product name cannot be empty')
  } else if (trimmed.length > 255) {
    errors.push('Product name exceeds 255 characters')
  } else if (trimmed.length < 2) {
    warnings.push('Product name is very short (less than 2 characters)')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate quantity
 */
export function validateQuantity(qty: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (qty === null || qty === undefined || qty === '') {
    errors.push('Quantity is required')
    return { isValid: false, errors, warnings }
  }

  const num = typeof qty === 'number' ? qty : parseFloat(String(qty))

  if (isNaN(num)) {
    errors.push('Quantity must be a number')
    return { isValid: false, errors, warnings }
  }

  if (!Number.isInteger(num)) {
    errors.push('Quantity must be a whole number')
  }

  if (num <= 0) {
    errors.push('Quantity must be greater than 0')
  } else if (num > 1000000) {
    warnings.push('Quantity is very large (over 1,000,000)')
  } else if (num < 1) {
    errors.push('Quantity must be at least 1')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate unit price
 */
export function validateUnitPrice(price: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (price === null || price === undefined || price === '') {
    errors.push('Unit price is required')
    return { isValid: false, errors, warnings }
  }

  const num = typeof price === 'number' ? price : parseFloat(String(price))

  if (isNaN(num)) {
    errors.push('Unit price must be a number')
    return { isValid: false, errors, warnings }
  }

  if (num <= 0) {
    errors.push('Unit price must be greater than 0')
  } else if (num > 10000000) {
    warnings.push('Unit price is very high (over 10,000,000)')
  } else if (num < 0.01) {
    warnings.push('Unit price is very low (less than 0.01)')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate expiry date
 */
export function validateExpiryDate(date: unknown, allowPastDates = false): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!date || date === '' || date === null) {
    errors.push('Expiry date is required')
    return { isValid: false, errors, warnings }
  }

  let dateObj: Date | null = null

  if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string') {
    dateObj = new Date(date)
  } else if (typeof date === 'number') {
    // Excel date serial number
    const excelEpoch = new Date(1900, 0, 1)
    const days = date - 2
    dateObj = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000)
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    errors.push('Invalid date format')
    return { isValid: false, errors, warnings }
  }

  // Check if date is in the past
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(dateObj)
  expiry.setHours(0, 0, 0, 0)

  if (!allowPastDates && expiry < today) {
    warnings.push('Expiry date is in the past')
  }

  // Check if date is too far in the future (more than 10 years)
  const maxFutureDate = new Date()
  maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 10)
  if (expiry > maxFutureDate) {
    warnings.push('Expiry date is more than 10 years in the future')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate a complete stock item
 */
export function validateStockItem(item: StockItemForValidation): ValidationReport {
  const productName = validateProductName(item.product_name)
  const quantity = validateQuantity(item.quantity)
  const unitPrice = validateUnitPrice(item.unit_price)
  const expiryDate = validateExpiryDate(item.expiry_date)

  const allErrors = [
    ...productName.errors,
    ...quantity.errors,
    ...unitPrice.errors,
    ...expiryDate.errors
  ]

  const allWarnings = [
    ...productName.warnings,
    ...quantity.warnings,
    ...unitPrice.warnings,
    ...expiryDate.warnings
  ]

  return {
    item,
    productName,
    quantity,
    unitPrice,
    expiryDate,
    overall: {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    }
  }
}

/**
 * Check for duplicate items in the upload batch
 */
export function checkDuplicatesInBatch(items: StockItemForValidation[]): Map<string, number[]> {
  const duplicateMap = new Map<string, number[]>()
  const itemKeyMap = new Map<string, number>()

  items.forEach((item, index) => {
    const key = `${item.product_name.toLowerCase().trim()}_${item.expiry_date}_${item.branch_id}`
    
    if (itemKeyMap.has(key)) {
      const firstIndex = itemKeyMap.get(key)!
      if (!duplicateMap.has(key)) {
        duplicateMap.set(key, [firstIndex])
      }
      duplicateMap.get(key)!.push(index)
    } else {
      itemKeyMap.set(key, index)
    }
  })

  return duplicateMap
}

/**
 * Check for duplicates against existing database items
 */
export async function checkDuplicatesInDatabase(
  items: StockItemForValidation[],
  supabaseClient: any
): Promise<Map<string, StockItemForValidation[]>> {
  const duplicateMap = new Map<string, StockItemForValidation[]>()

  // Group items by branch for efficient querying
  const itemsByBranch = new Map<string, StockItemForValidation[]>()
  items.forEach(item => {
    if (!itemsByBranch.has(item.branch_id)) {
      itemsByBranch.set(item.branch_id, [])
    }
    itemsByBranch.get(item.branch_id)!.push(item)
  })

  // Check each branch's items
  for (const [branchId, branchItems] of itemsByBranch) {
    const productNames = branchItems.map(item => item.product_name.trim())
    const expiryDates = branchItems.map(item => item.expiry_date)

    const { data: existingItems, error } = await supabaseClient
      .from('stock_items')
      .select('product_name, expiry_date, branch_id')
      .eq('branch_id', branchId)
      .in('product_name', productNames)

    if (error) {
      console.error('Error checking duplicates:', error)
      continue
    }

    // Check each upload item against existing items
    branchItems.forEach(item => {
      const existing = existingItems?.find((existing: any) => 
        existing.product_name.toLowerCase().trim() === item.product_name.toLowerCase().trim() &&
        existing.expiry_date === item.expiry_date &&
        existing.branch_id === item.branch_id
      )

      if (existing) {
        const key = `${item.product_name}_${item.expiry_date}_${item.branch_id}`
        if (!duplicateMap.has(key)) {
          duplicateMap.set(key, [])
        }
        duplicateMap.get(key)!.push(item)
      }
    })
  }

  return duplicateMap
}

