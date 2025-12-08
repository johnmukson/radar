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
  batch_number?: string | null
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
 * Supports any number from 1 to very large numbers (with or without commas)
 */
export function validateQuantity(qty: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (qty === null || qty === undefined || qty === '') {
    errors.push('Quantity is required')
    return { isValid: false, errors, warnings }
  }

  // Handle comma-separated numbers (e.g., "1,000" or "1,000,000")
  const qtyStr = String(qty).replace(/[,\s]/g, '').trim()
  const num = typeof qty === 'number' ? qty : parseFloat(qtyStr)

  if (isNaN(num) || !isFinite(num)) {
    errors.push('Quantity must be a valid number')
    return { isValid: false, errors, warnings }
  }

  if (!Number.isInteger(num)) {
    errors.push('Quantity must be a whole number')
  }

  if (num < 1) {
    errors.push('Quantity must be at least 1')
  } else if (num > Number.MAX_SAFE_INTEGER) {
    warnings.push(`Quantity is very large (over ${Number.MAX_SAFE_INTEGER.toLocaleString()})`)
  } else if (num > 1000000) {
    warnings.push('Quantity is very large (over 1,000,000)')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate unit price
 * Supports any positive number (with or without commas, with or without decimals)
 */
export function validateUnitPrice(price: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (price === null || price === undefined || price === '') {
    errors.push('Unit price is required')
    return { isValid: false, errors, warnings }
  }

  // Handle comma-separated numbers (e.g., "6,000" or "1,000,000.50")
  const priceStr = String(price).replace(/[,\s]/g, '').trim()
  const num = typeof price === 'number' ? price : parseFloat(priceStr)

  if (isNaN(num) || !isFinite(num)) {
    errors.push('Unit price must be a valid number')
    return { isValid: false, errors, warnings }
  }

  if (num <= 0) {
    errors.push('Unit price must be greater than 0')
  } else if (num > Number.MAX_SAFE_INTEGER) {
    warnings.push(`Unit price is very high (over ${Number.MAX_SAFE_INTEGER.toLocaleString()})`)
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

  // Allow null/empty expiry dates - they'll be stored as null in database
  if (!date || date === '' || date === null) {
    warnings.push('Expiry date is missing - will be stored as null')
    return { isValid: true, errors, warnings } // Don't block upload, just warn
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
    // ✅ Include batch_number in duplicate key
    // Format: product_name_expiry_date_branch_id_batch_number
    // If batch_number is null/undefined, use 'null' as part of the key
    const batchNum = item.batch_number ? String(item.batch_number).trim() : 'null'
    const key = `${item.product_name.toLowerCase().trim()}_${item.expiry_date || 'null'}_${item.branch_id}_${batchNum}`
    
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
 * Optimized to use exact match queries with concurrency control
 */
export async function checkDuplicatesInDatabase(
  items: StockItemForValidation[],
  supabaseClient: any
): Promise<Map<string, StockItemForValidation[]>> {
  const duplicateMap = new Map<string, StockItemForValidation[]>()
  
  // Limit the number of items to check to avoid blocking (check max 100 items)
  const itemsToCheck = items.slice(0, 100)
  
  if (items.length > 100) {
    console.warn(`Checking duplicates for first 100 items only (out of ${items.length} total)`)
  }

  // Use parallel checks with concurrency limit for better performance
  const CONCURRENCY_LIMIT = 20 // Check 20 items at a time
  const checkPromises: Array<Promise<void>> = []

  for (let i = 0; i < itemsToCheck.length; i += CONCURRENCY_LIMIT) {
    const chunk = itemsToCheck.slice(i, i + CONCURRENCY_LIMIT)
    
    const chunkPromises = chunk.map(async (item) => {
      try {
        // ✅ Use exact match query including batch_number (much faster with proper index)
        let query = supabaseClient
          .from('stock_items')
          .select('product_name, expiry_date, branch_id, batch_number')
          .eq('product_name', item.product_name.trim())
          .eq('branch_id', item.branch_id)
        
        // Handle null expiry_date correctly
        if (item.expiry_date === null || item.expiry_date === undefined || item.expiry_date === '') {
          query = query.is('expiry_date', null)
        } else {
          query = query.eq('expiry_date', item.expiry_date)
        }
        
        // ✅ Handle batch_number in duplicate check
        if (item.batch_number === null || item.batch_number === undefined || item.batch_number === '') {
          query = query.is('batch_number', null)
        } else {
          query = query.eq('batch_number', String(item.batch_number).trim())
        }
        
        const { data: existing, error } = await query.maybeSingle()

        if (error) {
          console.error('Error checking duplicate:', error)
          return
        }

        if (existing) {
          // ✅ Include batch_number in duplicate key
          const batchNum = item.batch_number ? String(item.batch_number).trim() : 'null'
          const key = `${item.product_name}_${item.expiry_date || 'null'}_${item.branch_id}_${batchNum}`
          if (!duplicateMap.has(key)) {
            duplicateMap.set(key, [])
          }
          duplicateMap.get(key)!.push(item)
        }
      } catch (error) {
        console.error('Error checking duplicate for item:', error)
      }
    })

    checkPromises.push(...chunkPromises)
    
    // Wait for this chunk to complete before starting next chunk
    await Promise.all(chunkPromises)
  }

  return duplicateMap
}

