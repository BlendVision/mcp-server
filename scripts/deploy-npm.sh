#!/bin/bash

# Script to prepare and publish the MCP server to npm

set -e

echo "📦 BlendVision MCP Server - NPM Publication"
echo "============================================"
echo ""

# Check if logged in to npm
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to npm. Please run: npm login"
    exit 1
fi

echo "✅ Logged in to npm as: $(npm whoami)"
echo ""

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"
echo ""

# Prompt for new version
read -p "Enter new version (or press Enter to keep current): " NEW_VERSION

if [ ! -z "$NEW_VERSION" ]; then
    npm version "$NEW_VERSION" --no-git-tag-version
    echo "✅ Version updated to: $NEW_VERSION"
fi

# Clean and build
echo ""
echo "🔨 Building project..."
rm -rf build/
npm install
npm run build

if [ ! -d "build" ]; then
    echo "❌ Build failed - build directory not found"
    exit 1
fi

echo "✅ Build completed"
echo ""

# Run tests if available
if grep -q "\"test\":" package.json; then
    echo "🧪 Running tests..."
    npm test
    echo "✅ Tests passed"
    echo ""
fi

# Show what will be published
echo "📋 Files to be published:"
npm pack --dry-run
echo ""

# Confirm publication
read -p "Do you want to publish to npm? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publication cancelled"
    exit 1
fi

# Publish
echo ""
echo "🚀 Publishing to npm..."
npm publish --access public

echo ""
echo "✅ Successfully published!"
echo ""
echo "Users can now install with:"
echo "  npm install -g @blendvision/mcp-server"
