#!/bin/bash

# Installation script for Claude Desktop on macOS
# This script helps you configure the BlendVision MCP server with Claude Desktop

set -e

echo "🚀 BlendVision MCP Server - Claude Desktop Installation"
echo "========================================================="
echo ""

# Get the absolute path to the MCP server
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MCP_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
BUILD_PATH="$MCP_DIR/build/index.js"

# Check if build exists
if [ ! -f "$BUILD_PATH" ]; then
    echo "❌ Build not found. Building the project..."
    cd "$MCP_DIR"
    npm install
    npm run build
    echo "✅ Build completed"
fi

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    CONFIG_DIR="$APPDATA/Claude"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Prompt for credentials
echo ""
echo "📝 Please enter your BlendVision credentials:"
echo ""
read -p "API Token: " API_TOKEN
read -p "Organization ID: " ORG_ID

# Create or update config
if [ -f "$CONFIG_FILE" ]; then
    echo ""
    echo "⚠️  Config file already exists at: $CONFIG_FILE"
    read -p "Do you want to backup and update it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%s)"
        echo "✅ Backup created"
    else
        echo "❌ Installation cancelled"
        exit 1
    fi
fi

# Generate config JSON
cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "blendvision": {
      "command": "node",
      "args": ["$BUILD_PATH"],
      "env": {
        "BLENDVISION_API_TOKEN": "$API_TOKEN",
        "BLENDVISION_ORG_ID": "$ORG_ID"
      }
    }
  }
}
EOF

echo ""
echo "✅ Configuration saved to: $CONFIG_FILE"
echo ""
echo "📋 Next steps:"
echo "1. Restart Claude Desktop"
echo "2. The BlendVision MCP server will be available"
echo "3. Try asking: 'List all my videos'"
echo ""
echo "🎉 Installation complete!"
