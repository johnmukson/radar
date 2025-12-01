# 🗂️ Schema Deletion Guide

## 📋 Overview
This guide provides methods to delete all database schemas and their contents while preserving the database structure. This is more targeted than dropping the entire database.

## ⚠️ WARNING
**These scripts will permanently delete ALL schemas and their contents including ALL tables, views, functions, triggers, and data. This action cannot be undone!**

---

## 🎯 What Gets Deleted

### ✅ **Schemas Targeted:**
- `public` schema (your main application schema)
- Any custom schemas you've created
- **Preserves:** System schemas (`information_schema`, `pg_catalog`, etc.)

### ✅ **Objects Deleted:**
- 🗃️ All tables and their data
- 👁️ All views  
- ⚙️ All functions and procedures
- 🔧 All triggers
- 🔗 All sequences
- 📊 All custom types
- 🛡️ All RLS policies

---

## 🚀 Quick Start Options

### **🎯 Option 1: Automated Scripts**

#### Windows:
```cmd
# Set your database URL first
set DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
reset_schemas.bat
```

#### Linux/Mac:
```bash
# Set your database URL first
export DATABASE_URL='postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres'
chmod +x reset_schemas.sh
./reset_schemas.sh
```

### **🎯 Option 2: Manual SQL**
Copy and paste the SQL from `delete_schemas.sql` into:
- Supabase SQL Editor, or
- Any PostgreSQL client (psql, pgAdmin, etc.)

### **🎯 Option 3: Supabase CLI (Recommended)**
```bash
supabase db reset
```

---

## 📄 Schema Deletion Methods

The `delete_schemas.sql` script provides **3 methods**:

### **Method 1: Drop & Recreate Public Schema (Default)**
```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
-- Restores default permissions
```

### **Method 2: Drop Specific Custom Schemas**
```sql
-- Uncomment lines for your custom schemas
DROP SCHEMA IF EXISTS your_custom_schema CASCADE;
```

### **Method 3: Nuclear Option (Drop All Non-System Schemas)**
```sql
-- Uncomment the DO block in the script
-- This deletes EVERYTHING except system schemas
```

---

## 🔗 Getting Your Database Connection URL

### From Supabase Dashboard:
1. Go to **Settings** → **Database**
2. Scroll to **Connection string**
3. Copy the **URI** format
4. Replace `[YOUR-PASSWORD]` with your actual password

**Format:**
```
postgresql://postgres:your_password@db.project_id.supabase.co:5432/postgres
```

---

## 📋 Step-by-Step Process

### **1. 🔄 Prepare**
```bash
# Navigate to your project directory
cd "C:\Users\User\Desktop\NOVA 1\expiry-master-main"

# Set your database connection
export DATABASE_URL='your_connection_string_here'
```

### **2. 🗑️ Delete Schemas**
Choose one method:
- Run automated script: `./reset_schemas.sh` (Linux/Mac) or `reset_schemas.bat` (Windows)
- Or manually execute `delete_schemas.sql`

### **3. ✅ Verify Deletion**
The script will automatically verify that schemas are cleaned:
```sql
-- Should show only system schemas
SELECT schema_name FROM information_schema.schemata;
```

### **4. 🏗️ Rebuild Schema**
Run your `backend_complete.md` script:
- Copy all SQL from the file
- Paste into Supabase SQL Editor
- Execute to create fresh schema

### **5. 🧪 Test**
```bash
npm run dev
# Test all application functionality
```

---

## 🚨 Troubleshooting

### **"Permission denied" errors:**
```sql
-- Grant yourself permissions
GRANT ALL ON SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
```

### **"Schema does not exist" errors:**
This is normal - schemas are being deleted.

### **Connection issues:**
- Verify your DATABASE_URL is correct
- Check your internet connection
- Ensure Supabase project is active

### **Objects still exist after deletion:**
```sql
-- Force delete any remaining objects
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

---

## ✅ Success Indicators

You'll know the deletion was successful when:

- ✅ Scripts complete without errors
- ✅ Verification queries show empty public schema
- ✅ `backend_complete.md` runs without conflicts
- ✅ Application starts fresh without object errors

---

## 🎯 Why Delete Schemas vs Entire Database?

### **Schema Deletion (This approach):**
- ✅ Faster and more targeted
- ✅ Preserves database configuration
- ✅ Maintains connection settings
- ✅ Keeps user permissions intact

### **Full Database Deletion:**
- ⚠️ More destructive
- ⚠️ May require database recreation
- ⚠️ Could affect other applications

---

## 🚀 After Schema Deletion

Your database will be completely clean with:
- 🔹 Empty `public` schema ready for new objects
- 🔹 Proper permissions configured
- 🔹 System schemas intact and functional
- 🔹 Connection settings preserved

**You're now ready to run your `backend_complete.md` script for a fresh start!**