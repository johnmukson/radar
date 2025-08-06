#!/bin/bash

# ============================================================================
# COMPLETE DATABASE RESET SCRIPT
# ============================================================================
# This script provides multiple methods to reset your database
# Choose the method that works best for your setup
# ============================================================================

echo "🚨 WARNING: This will completely delete your existing database!"
echo "📊 Current database will be wiped clean"
echo "⏰ You have 10 seconds to cancel (Ctrl+C)"
echo ""

# Countdown
for i in {10..1}; do
    echo "⏳ Deleting in $i seconds..."
    sleep 1
done

echo ""
echo "🗑️  Starting database deletion..."

# ============================================================================
# METHOD 1: Using Supabase CLI (Recommended if you have it)
# ============================================================================

if command -v supabase &> /dev/null; then
    echo "📱 Supabase CLI detected - Using Supabase reset"
    
    # Reset the database using Supabase CLI
    supabase db reset
    
    if [ $? -eq 0 ]; then
        echo "✅ Database reset successfully using Supabase CLI!"
        echo "🚀 You can now run your backend_complete.md script"
        exit 0
    else
        echo "❌ Supabase CLI reset failed, trying manual method..."
    fi
fi

# ============================================================================
# METHOD 2: Using psql with connection string
# ============================================================================

echo "💻 Using manual SQL deletion method..."

# Check if we have the delete_database.sql file
if [ -f "delete_database.sql" ]; then
    echo "📄 Found delete_database.sql, executing..."
    
    # You'll need to replace this with your actual database connection string
    # Get this from your Supabase dashboard under Settings > Database
    echo "⚠️  Please set your DATABASE_URL environment variable or edit this script"
    echo "🔗 Example: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
    
    if [ -n "$DATABASE_URL" ]; then
        psql "$DATABASE_URL" -f delete_database.sql
        
        if [ $? -eq 0 ]; then
            echo "✅ Database deletion completed successfully!"
            echo "🚀 You can now run your backend_complete.md script"
        else
            echo "❌ Database deletion failed"
            exit 1
        fi
    else
        echo "❌ DATABASE_URL not set. Please set it and try again:"
        echo "   export DATABASE_URL='postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres'"
        echo "   ./reset_database.sh"
        exit 1
    fi
else
    echo "❌ delete_database.sql not found. Please make sure it's in the current directory."
    exit 1
fi

echo ""
echo "🎉 Database reset complete!"
echo "📋 Next steps:"
echo "   1. Run your backend_complete.md SQL script"
echo "   2. Test your application"
echo "   3. Verify all tables and data are created correctly"