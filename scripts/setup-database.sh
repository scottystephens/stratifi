#!/bin/bash

# TreasuryX Database Setup Script
# This script sets up your exchange rates database with Supabase

set -e  # Exit on error

echo "🚀 TreasuryX Database Setup"
echo "============================"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed"
    echo "Install with: brew install postgresql"
    exit 1
fi

# Check if ts-node is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not available"
    echo "Make sure Node.js is installed"
    exit 1
fi

# Prompt for password
echo "📝 Enter your Supabase database password:"
echo "(Found at: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik/settings/database)"
read -s DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Password cannot be empty"
    exit 1
fi

# Construct connection string
export DATABASE_URL="postgresql://postgres.vnuithaqtpgbwmdvtxik:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

echo "✅ Connection string configured"
echo ""

# Test connection
echo "🔗 Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Connection successful!"
else
    echo "❌ Connection failed. Please check your password."
    exit 1
fi
echo ""

# Create table
echo "📊 Creating exchange_rates table..."
if psql "$DATABASE_URL" -f scripts/create-exchange-rates-table.sql; then
    echo "✅ Table created successfully!"
else
    echo "❌ Failed to create table"
    exit 1
fi
echo ""

# Add to Vercel
echo "☁️  Adding DATABASE_URL to Vercel..."
echo ""
echo "Run these commands manually (requires Vercel login):"
echo "  vercel env add DATABASE_URL production"
echo "  (paste your connection string when prompted)"
echo ""
echo "Or add manually at: https://vercel.com/dashboard"
echo "Settings → Environment Variables → Add New"
echo "Key: DATABASE_URL"
echo "Value: $DATABASE_URL"
echo ""
read -p "Press Enter after you've added the environment variable to Vercel..."
echo ""

# Backfill data
echo "📥 Backfilling exchange rates from January 1, 2025..."
echo "This will take about 30-60 seconds..."
echo ""

if npx ts-node scripts/backfill-exchange-rates.ts 2025-01-01; then
    echo ""
    echo "✅ Backfill complete!"
else
    echo ""
    echo "❌ Backfill failed"
    exit 1
fi
echo ""

# Verify data
echo "🔍 Verifying data..."
ROW_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM exchange_rates;")
LATEST_DATE=$(psql "$DATABASE_URL" -t -c "SELECT MAX(date) FROM exchange_rates;")

echo "✅ Total records: $ROW_COUNT"
echo "✅ Latest date: $LATEST_DATE"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Redeploy your app: cd /Users/scottstephens/stratiri && vercel --prod"
echo "2. Visit: https://stratiri.vercel.app/rates"
echo "3. You should see real exchange rates (no fallback warning)"
echo ""
echo "Your exchange rates will auto-update daily at 00:00 UTC via Vercel Cron"

