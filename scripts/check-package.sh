#!/bin/bash

# Script to check what will be published to npm

set -e

echo "🔍 Checking npm package contents"
echo "=================================="
echo ""

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found. Run 'npm run build' first."
    exit 1
fi

echo "✅ Build directory exists"
echo ""

# Create a dry-run package
echo "📦 Creating test package (dry-run)..."
npm pack --dry-run

echo ""
echo "📋 Files that will be included in the package:"
echo "----------------------------------------------"

# Show what files will be included
npm pack --dry-run 2>&1 | grep -E "^\s*(npm notice|package size)" || true

echo ""
echo "📊 Package size estimate:"
du -sh build/

echo ""
echo "🔎 Checking package.json fields..."

# Check required fields
REQUIRED_FIELDS=("name" "version" "description" "main" "bin" "license")
for field in "${REQUIRED_FIELDS[@]}"; do
    if grep -q "\"$field\"" package.json; then
        echo "✅ $field: present"
    else
        echo "❌ $field: missing"
    fi
done

echo ""
echo "📝 Current package info:"
echo "Name: $(node -p "require('./package.json').name")"
echo "Version: $(node -p "require('./package.json').version")"
echo "License: $(node -p "require('./package.json').license")"

echo ""
echo "✨ Ready to publish!"
echo ""
echo "Next steps:"
echo "1. Review the files listed above"
echo "2. Run: npm login"
echo "3. Run: npm publish --access public"
