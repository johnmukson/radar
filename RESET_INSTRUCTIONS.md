# 🗑️ Database Reset Instructions

## 📋 Overview
This guide provides multiple methods to completely delete your existing database and prepare for a fresh installation using your `backend_complete.md` script.

## ⚠️ WARNING
**These scripts will permanently delete ALL data in your database. This action cannot be undone!**

---

## 🎯 Method 1: Supabase CLI (Recommended)

If you have Supabase CLI installed:

### Windows:
```bash
supabase db reset
```

### Linux/Mac:
```bash
supabase db reset
```

This is the safest and most reliable method as it's designed specifically for Supabase.

---

## 🎯 Method 2: Using the Provided Scripts

### Windows Users:
1. **Open Command Prompt as Administrator**
2. **Navigate to your project directory:**
   ```cmd
   cd "C:\Users\User\Desktop\NOVA 1\expiry-master-main"
   ```
3. **Set your database connection URL:**
   ```cmd
   set DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@[YOUR_HOST]:5432/postgres
   ```
4. **Run the reset script:**
   ```cmd
   reset_database.bat
   ```

### Linux/Mac Users:
1. **Make the script executable:**
   ```bash
   chmod +x reset_database.sh
   ```
2. **Set your database connection URL:**
   ```bash
   export DATABASE_URL='postgresql://postgres:[YOUR_PASSWORD]@[YOUR_HOST]:5432/postgres'
   ```
3. **Run the reset script:**
   ```bash
   ./reset_database.sh
   ```

---

## 🎯 Method 3: Manual SQL Execution

If you prefer to run the SQL directly:

### Using psql:
```bash
psql "postgresql://postgres:[YOUR_PASSWORD]@[YOUR_HOST]:5432/postgres" -f delete_database.sql
```

### Using Supabase Dashboard:
1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `delete_database.sql`
4. Execute the script

---

## 🔗 Getting Your Database Connection URL

### From Supabase Dashboard:
1. Go to **Settings** → **Database**
2. Scroll down to **Connection string**
3. Copy the **URI** format
4. Replace `[YOUR-PASSWORD]` with your actual database password

Example format:
```
postgresql://postgres:your_password@db.project_id.supabase.co:5432/postgres
```

---

## 📋 Step-by-Step Process

### 1. ⚠️ Backup (Optional but Recommended)
If you want to save any existing data:
```sql
-- Export specific data you want to keep
SELECT * FROM your_important_table;
```

### 2. 🗑️ Delete Existing Database
Choose one of the methods above to delete the existing database.

### 3. ✅ Verify Deletion
Run this query to confirm tables are gone:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```
Should return empty or only system tables.

### 4. 🚀 Create New Database
Run your `backend_complete.md` script:
- Copy all SQL from `backend_complete.md`
- Paste into Supabase SQL Editor
- Execute the script

### 5. 🧪 Test Application
- Run `npm run dev`
- Test all functionality
- Verify no object errors

---

## 🚨 Troubleshooting

### If you get permission errors:
```sql
-- Grant yourself permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
```

### If tables still exist after deletion:
```sql
-- Force drop with cascade
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

### If you see "relation does not exist" errors:
This is normal during deletion - tables are being removed in order.

---

## 🎉 Success Indicators

You'll know the reset was successful when:
- ✅ No errors during deletion script execution
- ✅ Verification queries return empty results
- ✅ `backend_complete.md` script executes without errors
- ✅ Application starts without object reference errors

---

## 📞 Need Help?

If you encounter issues:
1. Check your database connection URL
2. Ensure you have proper permissions
3. Try the Supabase CLI method first
4. Contact support with the specific error message