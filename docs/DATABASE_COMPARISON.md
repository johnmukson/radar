# Database Comparison: Local vs Remote

## Summary
The local database (new schema from backend.md) and remote database (existing production) have **significant structural differences**.

---

## 🔴 Major Differences

### 1. **Tables Structure**

#### **Notes Table**
- **Local**: Simple structure with `user_id`, `branch_id`, `content`
- **Remote**: More complex with `is_public`, `created_by`, `recipient_id` (messaging system)

#### **Dormant Stock Table**
- **Local**: Has `stock_item_id`, `quantity`, `expiry_date`
- **Remote**: Missing these columns (simpler structure)

#### **Weekly Tasks Table**
- **Local**: Has `branch_id` column
- **Remote**: No `branch_id` column

#### **Stock Items Table**
- **Local**: Simple structure (product_name, quantity, unit_price, expiry_date, is_emergency)
- **Remote**: More complex with additional fields (status, assigned_to, priority, risk_level, etc.)

### 2. **Additional Tables in Remote (Not in Local)**
- `users` table (separate from auth.users)
- `branch_performance` table
- Complex views: `complete_dispenser_tasks_view`, `dispenser_tasks_summary`, `mathematical_dispenser_summary`

### 3. **Missing Tables in Remote (Present in Local)**
- `stock_movements` table (remote doesn't have this)
- `ai_recommendations` table (remote doesn't have this)

### 4. **ENUM Types**
- **Local**: Uses PostgreSQL ENUMs (task_priority, task_status, notification_type, notification_status)
- **Remote**: Uses TEXT with CHECK constraints (no ENUMs)

### 5. **Functions**
- **Local**: Has `generate_branch_code()`, `has_role()`, `update_updated_at_column()`
- **Remote**: Has different functions like `set_is_high_value()`, `update_stock_item_attributes()`, `can_modify_data()`

### 6. **RLS Policies**
- **Local**: Clean, role-based policies from backend.md
- **Remote**: More complex policies with different naming and logic

### 7. **Views**
- **Local**: `users_with_roles` view
- **Remote**: Multiple complex views for dispenser tasks and summaries

---

## ⚠️ Critical Differences

### **Foreign Key Constraints**
Remote database has different foreign key relationships:
- `notes` table references different structure
- `dormant_stock` has different relationships
- `weekly_tasks` doesn't link to branches

### **Data Types**
- Remote uses TEXT for status/priority fields
- Local uses ENUM types for better type safety

### **Triggers**
- Remote has custom triggers: `trg_set_is_high_value`, `trg_update_stock_item_attributes`
- Local has standard `update_updated_at_column` triggers

---

## 📊 Migration Status

**Local Migrations (8 new):**
- 20250101000000 - Extensions
- 20250101000001 - ENUMs
- 20250101000002 - Helper Functions
- 20250101000003 - Core Tables
- 20250101000004 - Branch Code Function
- 20250101000005 - Additional Tables
- 20250101000006 - Views
- 20250101000007 - RLS Policies

**Remote Migrations (17 existing):**
- Various migrations from June 2025
- Different schema evolution path

---

## 🎯 Recommendations

### Option 1: **Keep Remote Schema** (Recommended if you have production data)
- Pull remote migrations to local
- Adapt your new features to work with existing schema
- More work but preserves existing data

### Option 2: **Replace with New Schema** (⚠️ Data Loss)
- Push local migrations to remote
- Will drop existing tables and recreate
- **WARNING**: This will delete all existing data

### Option 3: **Hybrid Approach**
- Create migration to transform remote schema to match local
- Preserve data during transformation
- Most complex but safest

---

## 🔍 Next Steps

1. **Decide which schema to use** (remote or local)
2. **If keeping remote**: Pull migrations and adapt code
3. **If using local**: Backup remote data first, then push
4. **If hybrid**: Create transformation migrations

