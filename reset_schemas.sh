#!/bin/bash

# ============================================================================
# SCHEMA DELETION SCRIPT (Linux/Mac)
# ============================================================================
# This script deletes all schemas and their contents
# ============================================================================

echo "🗂️  SCHEMA DELETION UTILITY"
echo "=========================="
echo ""
echo "🚨 WARNING: This will delete ALL schemas and their contents!"
echo "📊 This includes ALL tables, views, functions, triggers, and data"
echo "⏰ You have 10 seconds to cancel (Ctrl+C)"
echo ""

# Countdown
for i in {10..1}; do
    echo "⏳ Deleting schemas in $i seconds..."
    sleep 1
done

echo ""
echo "🗑️  Starting schema deletion..."

# ============================================================================
# Check for Supabase CLI first
# ============================================================================

if command -v supabase &> /dev/null; then
    echo "📱 Supabase CLI detected"
    echo "🤔 Would you like to use 'supabase db reset' instead? (y/n)"
    read -r response
    
    if [[ "$response" == "y" || "$response" == "Y" ]]; then
        echo "🔄 Running Supabase database reset..."
        supabase db reset
        
        if [ $? -eq 0 ]; then
            echo "✅ Database reset successfully using Supabase CLI!"
            echo "🚀 You can now run your backend_complete.md script"
            exit 0
        else
            echo "❌ Supabase CLI reset failed, continuing with manual schema deletion..."
        fi
    fi
fi

# ============================================================================
# Manual schema deletion
# ============================================================================

echo "💻 Proceeding with manual schema deletion..."

# Check if we have the delete_schemas.sql file
if [ -f "delete_schemas.sql" ]; then
    echo "📄 Found delete_schemas.sql, executing..."
    
    # Check if DATABASE_URL is set
    if [ -n "$DATABASE_URL" ]; then
        echo "🔗 Using DATABASE_URL environment variable"
        psql "$DATABASE_URL" -f delete_schemas.sql
        
        if [ $? -eq 0 ]; then
            echo "✅ Schema deletion completed successfully!"
            echo "🚀 You can now run your backend_complete.md script"
        else
            echo "❌ Schema deletion failed"
            exit 1
        fi
    else
        echo "❌ DATABASE_URL not set."
        echo "🔗 Please set your database connection URL:"
        echo ""
        echo "   export DATABASE_URL='postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres'"
        echo ""
        echo "💡 You can find this in your Supabase dashboard:"
        echo "   Settings → Database → Connection string → URI"
        echo ""
        echo "🔄 Then run this script again:"
        echo "   ./reset_schemas.sh"
        exit 1
    fi
else
    echo "❌ delete_schemas.sql not found in current directory."
    echo "📁 Please ensure you're in the correct directory with the SQL file."
    exit 1
fi

echo ""
echo "🎉 Schema deletion complete!"
echo ""
echo "📋 Next steps:"
echo "   1. 📄 Copy the SQL from backend_complete.md"
echo "   2. 🔧 Run it in Supabase SQL Editor or via psql"
echo "   3. 🧪 Test your application"
echo "   4. ✅ Verify all functionality works correctly"
echo ""
echo "🚀 Your database is now ready for a fresh schema!"