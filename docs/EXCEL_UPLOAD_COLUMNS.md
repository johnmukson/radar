# Excel Upload Column Requirements

## Required Columns

Your Excel file **must** have these columns (at least one variation of each):

### 1. **Product Name** (Required)
**Recognized column names:**
- `product_name` (recommended - exact match)
- `Product`
- `ProductName`
- `name`
- `Name`
- `product name`

### 2. **Expiry Date** (Required)
**Recognized column names:**
- `expiry_date` (recommended - exact match)
- `expiry date`
- `expiry-date`
- `ExpiryDate`
- `Expiry Date`
- `Expiry-Date`
- `Expiry`
- `expiry`
- `EXPIRY`
- `exp_date`
- `exp date`
- `expiration_date`
- `expiration date`
- `date`
- `Date`
- `DATE`

**Date formats supported:**
- DD/MM/YYYY (e.g., "30/09/2025")
- YYYY/MM/DD (e.g., "2025/09/30")
- YYYY-MM-DD (e.g., "2025-09-30")
- Excel date serial numbers
- Standard date strings

**Note:** Empty or invalid dates will be stored as `null`.

### 3. **Quantity** (Required)
**Recognized column names:**
- `quantity` (recommended - exact match)
- `Quantity`
- `qty`
- `Qty`
- `QTY`

**Format:** 
- Whole numbers only (integers)
- **With or without commas:** "1000" or "1,000" or "1,000,000"
- **Range:** Any number from 1 to very large numbers (supports up to JavaScript's safe integer limit: 9,007,199,254,740,991)
- Examples: `1`, `100`, `1,000`, `10,000`, `1,000,000`, `999,999,999`

### 4. **Unit Price** (Required)
**Recognized column names:**
- `unit_price` (recommended - exact match)
- `UnitPrice`
- `Price`
- `price`
- `cost`
- `Cost`
- `unit price`
- `Unit Price`

**Format:**
- Numbers (can include decimals)
- **With or without commas:** "6000" or "6,000" or "1,000,000.50"
- **Range:** Any positive number (supports up to JavaScript's safe integer limit)
- Examples: `500`, `500.00`, `6,000`, `6,000.50`, `1,000,000.99`

---

## Optional Columns

### 5. **Batch Number** (Optional - Recommended for Duplicate Prevention)
**Recognized column names:**
- `batch_number` (recommended - exact match)
- `batch number`
- `batch-number`
- `BatchNumber`
- `Batch Number`
- `Batch-Number`
- `Batch`
- `batch`
- `BATCH`
- `batch_no`
- `batch no`
- `lot_number`
- `lot number`
- `lot`
- `Lot`

**Note:** If provided, the system will use batch numbers to prevent duplicates. Items with the same product name, expiry date, branch, AND batch number will be considered duplicates.

### 6. **Branch** (Optional - Will be Ignored)
**Recognized column names:**
- `branch`
- `Branch`
- `BranchName`
- `branch_name`
- `BRANCH`

**Note:** This column will be **ignored**. All items will be assigned to the branch you select in the upload interface.

---

## Example Excel File Structure

### Recommended Format:
| product_name | expiry_date | quantity | unit_price | batch_number |
|--------------|-------------|----------|------------|--------------|
| Paracetamol 500mg | 30/09/2025 | 100 | 500.00 | BATCH001 |
| Ibuprofen 200mg | 15/12/2025 | 50 | 750.00 | BATCH002 |
| Aspirin 100mg | 20/11/2025 | 200 | 300.00 | BATCH003 |

### Alternative Format (with different column names):
| Product Name | Expiry Date | Qty | Price | Batch Number |
|--------------|-------------|-----|-------|--------------|
| Paracetamol 500mg | 30/09/2025 | 100 | 500.00 | BATCH001 |
| Ibuprofen 200mg | 15/12/2025 | 50 | 750.00 | BATCH002 |

---

## Important Notes

1. **Column Name Matching:**
   - The system first tries **exact matches** (case-sensitive)
   - Then tries **case-insensitive** matches
   - Column names can have spaces, hyphens, or underscores

2. **Duplicate Detection:**
   - Without batch number: Items are considered duplicates if they have the same `product_name`, `expiry_date`, and `branch_id`
   - With batch number: Items are considered duplicates if they have the same `product_name`, `expiry_date`, `branch_id`, AND `batch_number`
   - **Recommendation:** Always include batch numbers to prevent false duplicates

3. **Date Handling:**
   - Empty dates → stored as `null`
   - Invalid dates → stored as `null`
   - Dates parsed as "Jan 01, 1970" → stored as `null` (treated as error)

4. **Branch Assignment:**
   - The branch column in Excel is **ignored**
   - All items are assigned to the branch you select in the upload interface
   - This ensures data integrity and prevents branch mismatches

5. **Data Validation:**
   - Product names must not be empty
   - Quantities must be whole numbers ≥ 1 (supports very large numbers)
   - Unit prices must be positive numbers > 0 (supports decimals and very large numbers)
   - Both quantity and unit price accept numbers with or without commas
   - Items with validation errors will still be uploaded (with warnings)

---

## Quick Reference

**Minimum Required Columns:**
- Product Name
- Expiry Date
- Quantity
- Unit Price

**Recommended Columns (for best results):**
- Product Name
- Expiry Date
- Quantity
- Unit Price
- **Batch Number** (prevents false duplicates)

