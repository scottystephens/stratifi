#!/bin/bash

# Stratiri Rebrand Script
# Updates all Stratiri references to Stratiri

echo "🎨 Starting Stratiri rebrand..."
echo ""

# Update package.json
sed -i '' 's/"name": "stratiri"/"name": "stratiri"/g' package.json
echo "✓ Updated package.json"

# Rename stratiri-logo.tsx to stratiri-logo.tsx
if [ -f "components/stratiri-logo.tsx" ]; then
    mv components/stratiri-logo.tsx components/stratiri-logo.tsx
    echo "✓ Renamed stratiri-logo.tsx to stratiri-logo.tsx"
fi

# Update app pages
find app -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find app -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated app/ files"

# Update docs
find docs -type f -name "*.md" -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find docs -type f -name "*.md" -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated docs/ files"

# Update components
find components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated components/ files"

# Update scripts
find scripts -type f \( -name "*.ts" -o -name "*.md" -o -name "*.sql" -o -name "*.sh" \) -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find scripts -type f \( -name "*.ts" -o -name "*.md" -o -name "*.sql" -o -name "*.sh" \) -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated scripts/ files"

# Update lib files
find lib -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find lib -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated lib/ files"

# Update data files
find data -type f \( -name "*.csv" -o -name "*.md" \) -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find data -type f \( -name "*.csv" -o -name "*.md" \) -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated data/ files"

# Update root files
find . -maxdepth 1 -type f \( -name "*.md" -o -name "*.json" -o -name "*.js" -o -name "*.ts" \) -exec sed -i '' 's/Stratiri/Stratiri/g' {} \;
find . -maxdepth 1 -type f \( -name "*.md" -o -name "*.json" -o -name "*.js" -o -name "*.ts" \) -exec sed -i '' 's/stratiri/stratiri/g' {} \;

echo "✓ Updated root files"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Rebrand Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Changed:"
echo "  • Stratiri → Stratiri"
echo "  • stratiri → stratiri"
echo ""
echo "Updated in:"
echo "  • package.json - Package name"
echo "  • components/stratiri-logo.tsx → components/stratiri-logo.tsx"
echo "  • app/ - All page and component files"
echo "  • docs/ - All documentation"
echo "  • components/ - All component files"
echo "  • scripts/ - All scripts and SQL files"
echo "  • lib/ - All library files"
echo "  • data/ - CSV and markdown files"
echo "  • Root files - README.md, etc."
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Test build: npm run build"
echo "  3. Update external services (Vercel, Supabase, etc.)"
echo "  4. Commit: git commit -am 'rebrand: Complete rebrand to Stratiri'"
echo ""

