# Database Check Guide

This guide helps you inspect and verify your entire Supabase database.

## Quick Check (Recommended First)

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `check-database-simple.sql`
3. Run the query
4. Review the results

## Comprehensive Check

For a detailed inspection:

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `check-database.sql`
3. Run the query (may take a few minutes for large databases)
4. Review all sections

## What Gets Checked

### Quick Check Includes:
- ✅ All tables and their column counts
- ✅ Row counts for major tables
- ✅ Key indexes
- ✅ RLS (Row Level Security) status
- ✅ Sample data from key tables

### Comprehensive Check Includes:
1. **Database Information** - Version, user, schema
2. **All Tables** - Complete list with metadata
3. **Table Structures** - Columns, types, constraints
4. **Indexes** - All indexes and their definitions
5. **Foreign Keys** - Relationships between tables
6. **RLS Policies** - Security policies
7. **RLS Status** - Which tables have RLS enabled
8. **Row Counts** - Data volume per table
9. **Functions** - Stored procedures and functions
10. **Triggers** - Database triggers
11. **Views** - Database views
12. **Sequences** - Auto-increment sequences
13. **Sample Data** - Recent records from key tables
14. **Data Integrity** - Orphaned records, invalid data
15. **Index Usage** - Which indexes are being used
16. **Table Sizes** - Storage usage
17. **Missing Indexes** - Foreign keys without indexes
18. **Summary Report** - Overall statistics

## Expected Results

### Healthy Database Should Show:
- ✅ All expected tables exist
- ✅ No orphaned records (foreign key violations)
- ✅ No negative quantities or prices
- ✅ RLS enabled on sensitive tables
- ✅ Indexes on frequently queried columns
- ✅ Reasonable table sizes

### Red Flags:
- ❌ Missing tables
- ❌ Orphaned records (stock_items without valid branch_id)
- ❌ Negative quantities or prices
- ❌ Missing indexes on foreign keys
- ❌ Very large table sizes without indexes
- ❌ RLS disabled on sensitive tables

## Common Issues Found

### 1. Missing Indexes
If the check shows missing indexes on foreign keys, create them:
```sql
CREATE INDEX idx_stock_items_branch_id ON stock_items(branch_id);
```

### 2. Orphaned Records
If orphaned records are found, clean them up:
```sql
DELETE FROM stock_items 
WHERE branch_id NOT IN (SELECT id FROM branches);
```

### 3. Invalid Data
Fix invalid dates or negative values:
```sql
UPDATE stock_items 
SET expiry_date = CURRENT_DATE + INTERVAL '1 year'
WHERE expiry_date IS NULL OR expiry_date < '1900-01-01';

UPDATE stock_items 
SET quantity = 0 
WHERE quantity < 0;
```

## Running the Checks

### Option 1: Supabase Dashboard
1. Go to your Supabase project
2. Click "SQL Editor" in the left sidebar
3. Click "New query"
4. Paste the SQL script
5. Click "Run" or press Ctrl+Enter

### Option 2: Supabase CLI
```bash
supabase db execute --file check-database-simple.sql
```

## Interpreting Results

### Table Counts
- **Expected**: All tables from your schema should exist
- **Action if missing**: Run migrations to create missing tables

### Row Counts
- **Expected**: Reasonable numbers based on your usage
- **Action if 0**: Check if data was deleted or never inserted
- **Action if very high**: Consider archiving old data

### Index Status
- **Expected**: Indexes on foreign keys and frequently queried columns
- **Action if missing**: Create indexes for better performance

### RLS Status
- **Expected**: RLS enabled on tables with sensitive data
- **Action if disabled**: Enable RLS and create policies

## Next Steps After Check

1. **If issues found**: Fix them using the SQL provided in "Common Issues"
2. **If all good**: Your database is healthy!
3. **If unsure**: Share the results for analysis

## Files

- `check-database-simple.sql` - Quick overview (recommended first)
- `check-database.sql` - Comprehensive check (detailed analysis)

