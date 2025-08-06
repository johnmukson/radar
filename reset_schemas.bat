@echo off
REM ============================================================================
REM SCHEMA DELETION SCRIPT (Windows)
REM ============================================================================
REM This script deletes all schemas and their contents
REM ============================================================================

echo.
echo 🗂️  SCHEMA DELETION UTILITY
echo ==========================
echo.
echo 🚨 WARNING: This will delete ALL schemas and their contents!
echo 📊 This includes ALL tables, views, functions, triggers, and data
echo ⏰ You have 10 seconds to cancel (Ctrl+C)
echo.

REM Countdown
for /l %%i in (10,-1,1) do (
    echo ⏳ Deleting schemas in %%i seconds...
    timeout /t 1 /nobreak >nul
)

echo.
echo 🗑️  Starting schema deletion...

REM ============================================================================
REM Check for Supabase CLI first
REM ============================================================================

where supabase >nul 2>&1
if %errorlevel% == 0 (
    echo 📱 Supabase CLI detected
    set /p response="🤔 Would you like to use 'supabase db reset' instead? (y/n): "
    
    if /i "%response%"=="y" (
        echo 🔄 Running Supabase database reset...
        supabase db reset
        
        if %errorlevel% == 0 (
            echo ✅ Database reset successfully using Supabase CLI!
            echo 🚀 You can now run your backend_complete.md script
            goto :end
        ) else (
            echo ❌ Supabase CLI reset failed, continuing with manual schema deletion...
        )
    )
)

REM ============================================================================
REM Manual schema deletion
REM ============================================================================

echo 💻 Proceeding with manual schema deletion...

REM Check if we have the delete_schemas.sql file
if exist "delete_schemas.sql" (
    echo 📄 Found delete_schemas.sql, executing...
    
    REM Check if DATABASE_URL is set
    if defined DATABASE_URL (
        echo 🔗 Using DATABASE_URL environment variable
        psql "%DATABASE_URL%" -f delete_schemas.sql
        
        if %errorlevel% == 0 (
            echo ✅ Schema deletion completed successfully!
            echo 🚀 You can now run your backend_complete.md script
        ) else (
            echo ❌ Schema deletion failed
            exit /b 1
        )
    ) else (
        echo ❌ DATABASE_URL not set.
        echo 🔗 Please set your database connection URL:
        echo.
        echo    set DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
        echo.
        echo 💡 You can find this in your Supabase dashboard:
        echo    Settings → Database → Connection string → URI
        echo.
        echo 🔄 Then run this script again:
        echo    reset_schemas.bat
        exit /b 1
    )
) else (
    echo ❌ delete_schemas.sql not found in current directory.
    echo 📁 Please ensure you're in the correct directory with the SQL file.
    exit /b 1
)

:end
echo.
echo 🎉 Schema deletion complete!
echo.
echo 📋 Next steps:
echo    1. 📄 Copy the SQL from backend_complete.md
echo    2. 🔧 Run it in Supabase SQL Editor or via psql
echo    3. 🧪 Test your application
echo    4. ✅ Verify all functionality works correctly
echo.
echo 🚀 Your database is now ready for a fresh schema!

pause