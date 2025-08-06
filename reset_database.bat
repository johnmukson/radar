@echo off
REM ============================================================================
REM COMPLETE DATABASE RESET SCRIPT (Windows)
REM ============================================================================
REM This script provides methods to reset your database on Windows
REM ============================================================================

echo.
echo 🚨 WARNING: This will completely delete your existing database!
echo 📊 Current database will be wiped clean
echo ⏰ You have 10 seconds to cancel (Ctrl+C)
echo.

REM Countdown
for /l %%i in (10,-1,1) do (
    echo ⏳ Deleting in %%i seconds...
    timeout /t 1 /nobreak >nul
)

echo.
echo 🗑️  Starting database deletion...

REM ============================================================================
REM METHOD 1: Using Supabase CLI (Recommended if you have it)
REM ============================================================================

where supabase >nul 2>&1
if %errorlevel% == 0 (
    echo 📱 Supabase CLI detected - Using Supabase reset
    supabase db reset
    
    if %errorlevel% == 0 (
        echo ✅ Database reset successfully using Supabase CLI!
        echo 🚀 You can now run your backend_complete.md script
        goto :end
    ) else (
        echo ❌ Supabase CLI reset failed, trying manual method...
    )
)

REM ============================================================================
REM METHOD 2: Using psql with connection string
REM ============================================================================

echo 💻 Using manual SQL deletion method...

REM Check if we have the delete_database.sql file
if exist "delete_database.sql" (
    echo 📄 Found delete_database.sql, executing...
    
    REM Check if DATABASE_URL is set
    if defined DATABASE_URL (
        psql "%DATABASE_URL%" -f delete_database.sql
        
        if %errorlevel% == 0 (
            echo ✅ Database deletion completed successfully!
            echo 🚀 You can now run your backend_complete.md script
        ) else (
            echo ❌ Database deletion failed
            exit /b 1
        )
    ) else (
        echo ❌ DATABASE_URL not set. Please set it and try again:
        echo    set DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
        echo    reset_database.bat
        exit /b 1
    )
) else (
    echo ❌ delete_database.sql not found. Please make sure it's in the current directory.
    exit /b 1
)

:end
echo.
echo 🎉 Database reset complete!
echo 📋 Next steps:
echo    1. Run your backend_complete.md SQL script
echo    2. Test your application
echo    3. Verify all tables and data are created correctly

pause