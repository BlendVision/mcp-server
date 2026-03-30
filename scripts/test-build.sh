#!/bin/bash

# Quick test script to verify the build works

set -e

echo "🧪 Testing BlendVision MCP Server Build"
echo "========================================"
echo ""

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found. Running build..."
    npm run build
fi

# Check if required files exist
FILES=("build/index.js" "build/client.js" "build/types.js")
for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing file: $file"
        exit 1
    fi
done

echo "✅ All build files present"
echo ""

# Check for required environment variables
if [ -z "$BLENDVISION_API_TOKEN" ] || [ -z "$BLENDVISION_ORG_ID" ]; then
    echo "⚠️  Environment variables not set"
    echo ""
    echo "To run the server, set:"
    echo "  export BLENDVISION_API_TOKEN=your_token"
    echo "  export BLENDVISION_ORG_ID=your_org_id"
    echo ""
    echo "✅ Build is valid, but credentials needed to run"
else
    echo "✅ Environment variables are set"
    echo ""
    echo "You can now run:"
    echo "  npm run dev"
    echo ""
    echo "Or install to Claude Desktop:"
    echo "  npm run install:claude"
fi

echo ""
echo "🎉 Build test complete!"
