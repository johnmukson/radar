// Web Worker for parsing Excel files - prevents UI blocking
import * as XLSX from 'xlsx'

self.onmessage = function(e: MessageEvent<{ data: ArrayBuffer; type: 'parse' }>) {
  try {
    const { data } = e.data
    
    // Parse Excel file in worker thread (non-blocking for UI)
    const workbook = XLSX.read(data, { 
      type: 'array',
      cellDates: true,  // Parse dates as Date objects
      cellNF: false,
      cellText: false,
      dense: false,
      dateNF: 'yyyy-mm-dd' // Date number format
    })
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      self.postMessage({ 
        error: 'Excel file contains no worksheets. Please ensure the file has at least one sheet with data.' 
      })
      return
    }
    
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!worksheet) {
      self.postMessage({ 
        error: 'Could not read the first worksheet from the file.' 
      })
      return
    }
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: false
    })
    
    // Send parsed data back to main thread
    self.postMessage({ 
      success: true, 
      data: jsonData,
      sheetNames: workbook.SheetNames
    })
  } catch (error) {
    self.postMessage({ 
      error: error instanceof Error ? error.message : 'Failed to parse Excel file' 
    })
  }
}

