# Remote Database Backup

**Backup Date:** 2025-11-05  
**Remote Project:** expiry guardian (pvtrcbemeesaebrwhenw)  
**Region:** South America (São Paulo)

---

## 📦 Backup Files

### 1. **remote_backup_20251105_201522.sql**
- **Type:** Schema only (structure, no data)
- **Contains:** Table definitions, RLS policies, functions, views, triggers
- **Purpose:** Backup of database structure
- **Use Case:** Restore schema without data

### 2. **remote_data_backup_20251105_201642.sql**
- **Type:** Data only (no schema)
- **Contains:** All data from tables
- **Purpose:** Backup of all data
- **Use Case:** Restore data without schema changes
- **⚠️ Warning:** Has circular foreign-key constraints (notes table)

### 3. **remote_full_backup_20251105_202221.sql**
- **Type:** Full backup (schema + data)
- **Contains:** Complete database structure and data
- **Purpose:** Complete backup for disaster recovery
- **Use Case:** Full restore of database

---

## 🔄 How to Restore

### **Restore Full Backup:**
```bash
# Restore full backup to remote database
supabase db reset --linked
psql -h [remote-host] -U postgres -d postgres -f backups/remote_full_backup_20251105_202221.sql

# Or using Supabase CLI
supabase db push --linked --file backups/remote_full_backup_20251105_202221.sql
```

### **Restore Schema Only:**
```bash
psql -h [remote-host] -U postgres -d postgres -f backups/remote_backup_20251105_201522.sql
```

### **Restore Data Only:**
```bash
# Note: May need to disable triggers due to circular foreign keys
psql -h [remote-host] -U postgres -d postgres -f backups/remote_data_backup_20251105_201642.sql
```

---

## 📊 What Was Backed Up

### **Tables (13 tables):**
- ✅ `branches`
- ✅ `users`
- ✅ `user_roles`
- ✅ `stock_items`
- ✅ `emergency_assignments`
- ✅ `dormant_stock`
- ✅ `notes`
- ✅ `notifications`
- ✅ `weekly_tasks`
- ✅ `stock_movement_history`
- ✅ `stock_movements`
- ✅ `whatsapp_notifications`
- ✅ `branch_performance`
- ✅ `ai_recommendations`

### **Views (13 views):**
- ✅ `complete_dispenser_tasks_view`
- ✅ `dispenser_tasks_summary`
- ✅ `dispensers_view`
- ✅ `high_value_items_monthly_summary`
- ✅ `mathematical_dispenser_summary`
- ✅ `mathematical_dispenser_tasks_view`
- ✅ `stock_items_view`
- ✅ `stock_movement_history_view`
- ✅ `unified_assignments_view`
- ✅ `user_permissions_debug`
- ✅ `users_with_roles`
- ✅ `users_with_roles_and_branches`
- ✅ `weekly_assignments_view`

### **Functions:**
- ✅ `has_role()`
- ✅ `can_modify_data()`
- ✅ `generate_branch_code()`
- ✅ `assign_user_role()`
- ✅ `check_user_permissions()`
- ✅ `distribute_tasks_mathematically()`
- ✅ `get_all_tasks_for_month()`
- ✅ `get_dispenser_tasks_for_month()`
- ✅ `get_week_number()`

### **RLS Policies:**
- ✅ All RLS policies for all tables
- ✅ Branch isolation policies
- ✅ Role-based access policies

---

## ⚠️ Important Notes

1. **Circular Foreign Keys:**
   - The `notes` table has circular foreign-key constraints
   - When restoring data-only backup, you may need to disable triggers temporarily

2. **Backup Location:**
   - All backups are in the `backups/` directory
   - Keep these files safe - they contain your production data

3. **Before Restoring:**
   - Always backup current state before restoring
   - Test restore on local/staging first
   - Verify data integrity after restore

4. **Security:**
   - These backup files may contain sensitive data
   - Do not commit to version control
   - Store securely

---

## 📋 Backup Verification

To verify backups were created successfully:

```bash
# Check file sizes
Get-ChildItem backups\*.sql | Select-Object Name, Length, LastWriteTime

# Check backup file contents (first 50 lines)
Get-Content backups/remote_full_backup_*.sql | Select-Object -First 50
```

---

## 🎯 Next Steps

1. ✅ **Backup Complete** - Remote database is backed up
2. ⏭️ **Review Remote Policies** - Compare with local migrations
3. ⏭️ **Update Local Migrations** - Merge remote improvements
4. ⏭️ **Test Locally** - Verify all changes work
5. ⏭️ **Plan Migration** - Safe way to update remote

---

**Backup Created:** 2025-11-05  
**Backup Location:** `backups/` directory

