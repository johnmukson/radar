# Stock Upload Performance Fix

## Issues Diagnosed

### 1. **Missing Database Index** ❌
**Problem**: No composite index on `(product_name, branch_id, expiry_date)` which is the exact combination used for duplicate checking during reconcile mode.

**Impact**: Database had to perform full table scans or inefficient index scans for each duplicate check, causing severe slowdowns.

**Existing Indexes**:
- `idx_stock_items_branch_expiry` on `(branch_id, expiry_date)`
- `idx_stock_items_expiry` on `(expiry_date)`
- `idx_stock_items_branch` on `(branch_id)`
- **Missing**: Index on `product_name` and composite index on `(product_name, branch_id, expiry_date)`

### 2. **Inefficient Batch Query** ❌
**Problem**: The query used `.in('product_name', uniqueProducts).in('expiry_date', uniqueDates)` which creates a **Cartesian product**.

**Example**: If you have 50 unique products and 10 unique dates in a batch:
- Query returns: 50 × 10 = **500 rows** (all combinations)
- Actual needed: ~25 rows (exact matches)
- **20x more data than needed!**

**Impact**: 
- Slow query execution
- Excessive network transfer
- Unnecessary memory usage
- Database load

### 3. **No Concurrency Control** ⚠️
**Problem**: All items in a batch (100 items) were checked in parallel, potentially overwhelming the database.

## Fixes Applied

### 1. **Added Missing Indexes** ✅
Created migration: `20250115000000_add_stock_items_composite_index.sql`

```sql
-- Composite index for exact duplicate checking
CREATE INDEX IF NOT EXISTS idx_stock_items_product_branch_expiry 
ON public.stock_items (product_name, branch_id, expiry_date);

-- Index on product_name for general queries
CREATE INDEX IF NOT EXISTS idx_stock_items_product_name 
ON public.stock_items (product_name);
```

**Benefits**:
- Fast lookups for duplicate checking
- Optimized queries for product searches
- Better overall database performance

### 2. **Fixed Query Logic** ✅
**Before**: Cartesian product query
```typescript
.in('product_name', uniqueProducts)
.in('expiry_date', uniqueDates)
```

**After**: Individual exact-match queries with concurrency control
```typescript
// Check each item individually with exact match
.eq('product_name', item.product_name)
.eq('branch_id', item.branch_id)
.eq('expiry_date', item.expiry_date)
```

**Benefits**:
- Only fetches exact matches (no Cartesian product)
- Uses the new composite index efficiently
- More accurate results

### 3. **Added Concurrency Control** ✅
**Implementation**: Process checks in chunks of 10 at a time

```typescript
const CONCURRENCY_LIMIT = 10 // Process 10 checks at a time
```

**Benefits**:
- Prevents database overload
- Better resource management
- More predictable performance

## Performance Improvements

### Expected Results:
- **Query Speed**: 10-20x faster (exact matches vs Cartesian product)
- **Database Load**: Significantly reduced
- **Memory Usage**: Much lower (only exact matches returned)
- **Network Transfer**: Minimal (only needed data)

### Before vs After:
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Rows Returned (100 items, 50 products, 10 dates) | ~500 | ~25 | 20x less |
| Query Type | Cartesian Product | Exact Match | Optimized |
| Index Usage | Partial | Full Composite | Optimal |
| Concurrency | Unlimited | Limited to 10 | Controlled |

## Next Steps

1. **Apply Migration**: Run the migration to create the indexes
   ```bash
   # If using Supabase CLI
   supabase migration up
   ```

2. **Test Upload**: Try uploading a file to verify the performance improvement

3. **Monitor**: Check database query performance in Supabase dashboard

## Additional Recommendations

1. **Monitor Query Performance**: Use Supabase dashboard to monitor slow queries
2. **Consider Batch Size**: If still slow, reduce `BATCH_SIZE` from 100 to 50
3. **Database Maintenance**: Run `ANALYZE` on the table after migration to update statistics

## Files Changed

1. `supabase/migrations/20250115000000_add_stock_items_composite_index.sql` - New migration
2. `src/components/StockUpload.tsx` - Fixed query logic and added concurrency control

