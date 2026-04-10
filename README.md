# BlendVision MCP Server

Model Context Protocol (MCP) server for BlendVision One API. This server enables AI assistants to interact with BlendVision's video platform services including VOD, live streaming, chatrooms, and analytics.

## Features

### Supported API Categories

- **Video On Demand (VOD)**: Create, manage, and query video content
- **Live Streaming**: Manage live channels and streaming sessions
- **Library & File Upload**: Upload and manage files in BlendVision library
- **Chatroom**: Create and manage real-time chat experiences
- **Account & Organization**: Access account information and organization details
- **Playback**: Generate playback tokens and manage access codes
- **Analytics**: Retrieve analytics and reporting data

### Available Tools

#### VOD Tools
- `list_videos` - List all videos with filtering options
- `get_video` - Get video details by ID
- `create_video` - Create a new video
- `update_video` - Update video metadata
- `delete_video` - Delete a video

#### Live Streaming Tools
- `list_live_channels` - List all live channels
- `get_live_channel` - Get channel details by ID
- `create_live_channel` - Create a new live channel
- `update_live_channel` - Update channel settings
- `delete_live_channel` - Delete a channel
- `start_live` - Start live streaming
- `stop_live` - Stop live streaming
- `cancel_live_channel` - Cancel and archive a live stream
- `archive_live_channel` - Archive a live stream permanently

#### Library & File Upload Tools
- `upload_file` - Initiate file upload and get presigned URLs
- `complete_file_upload` - Complete file upload session after uploading parts

#### Chatroom Tools
- `list_chatrooms` - List all chatrooms
- `get_chatroom` - Get chatroom details
- `create_chatroom` - Create a new chatroom
- `send_chatroom_message` - Send a message to a chatroom

#### Account Tools
- `get_account` - Get current account information
- `list_organizations` - List accessible organizations

#### Playback Tools
- `generate_playback_token` - Generate tokens for content access
- `list_playback_codes` - List playback codes for a resource

#### Analytics Tools
- `get_analytics` - Retrieve analytics reports

## Quick Start with Claude Code

### Option 1: Auto-Detection (Recommended)

1. Clone this repository:

```bash
git clone https://github.com/blendvision/mcp-server.git
cd mcp-server
```

2. Install dependencies and build:

```bash
npm install
npm run build
```

3. Configure your credentials:

```bash
cp .mcp.json.example .mcp.json
# Edit .mcp.json and add your BLENDVISION_API_TOKEN
```

4. Open this project directory in Claude Code:
   - The `.mcp.json` config will be auto-detected
   - All 35+ tools become available immediately

### Option 2: Manual Registration

Add manually via command line:

```bash
claude mcp add --transport stdio --scope project blendvision \
  -- node /path/to/mcp-server/build/index.js
```

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variable:

```bash
export BLENDVISION_API_TOKEN="your_api_token"
export BLENDVISION_BASE_URL="https://api.one.blendvision.com"  # Optional
```

### Obtaining API Token

To get your API token:

1. Login to your BlendVision console
2. Navigate to [Developers > API Tokens](https://app.one.blendvision.com/en/developers/api-token)
3. Click on **Create New API Token**
4. Set the **Expiration Date**
5. Copy the `API Token` from the dialog

## Deployment

### NPM Package (Recommended for Easy Installation)

#### Installing from npm

Once published to npm, users can install directly:

```bash
# Global installation
npm install -g @blendvision/mcp-server

# Or use with npx (no installation required)
npx @blendvision/mcp-server
```

#### Claude Desktop Configuration

After installation, configure Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

**Using npx (recommended - always uses latest version):**
```json
{
  "mcpServers": {
    "blendvision": {
      "command": "npx",
      "args": ["-y", "@blendvision/mcp-server"],
      "env": {
        "BLENDVISION_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Using global installation:**
```json
{
  "mcpServers": {
    "blendvision": {
      "command": "blendvision-mcp",
      "env": {
        "BLENDVISION_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

#### Publishing to npm

For maintainers who want to publish this package:

1. See [PUBLISHING.md](PUBLISHING.md) for detailed instructions
2. Quick publish:

   ```bash
   npm login
   npm run build
   npm publish --access public
   ```

## Testing with MCP Inspector

Test your server before deployment:

```bash
npm run inspector
```

This opens a web interface to test all available tools.

### Testing API Connection

Before using the MCP server, verify your credentials work with the BlendVision API:

```bash
export BLENDVISION_API_TOKEN="your_token"
npm run test:connection
```

This will test connectivity to:
- Account API
- Organization API
- CMS API (Videos)

## Example Queries

Once connected to an MCP client like Claude, you can ask:

- "List all my videos"
- "Create a new live channel called 'Product Launch'"
- "Generate a playback token for video ID abc123"
- "Show me analytics for the last 7 days"
- "Start the live stream on channel xyz789"

## API Reference

This MCP server wraps the BlendVision One API. For detailed API documentation, visit:
https://developers.blendvision.com/docs/category/bv-one-api

## Authentication

The server uses BlendVision's API Token authentication. It automatically:

1. Adds your API Token as a Bearer token in the Authorization header
2. All API requests are authenticated with your credentials

Note: Organization ID can be optionally provided per-request if needed for multi-organization scenarios.

## Error Handling

The server returns structured error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  }
}
```

## Development

### Project Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Main MCP server (protocol handler)
│   ├── client.ts             # BlendVision API client
│   ├── types.ts              # TypeScript type definitions
│   └── tools/                # Modular tool organization
│       ├── index.ts          # Tool module exports
│       ├── base_tool.ts      # Base class with retry & pagination
│       ├── tool_registry.ts  # Central tool registration
│       ├── vod_tools.ts      # VOD tools (5 tools)
│       ├── live_tools.ts     # Live streaming tools (9 tools)
│       ├── library_tools.ts  # Library & file upload tools (2 tools)
│       ├── analytics_tools.ts # Analytics tools (5 tools)
│       ├── chatroom_tools.ts # Chatroom tools (4 tools)
│       ├── account_tools.ts  # Account & Playback tools (5 tools)
│       └── clips_tools.ts    # Clips & Auto-tagging tools (6 tools)
├── build/                    # Compiled output
├── .mcp.json.example         # MCP config template
├── package.json
├── tsconfig.json
├── README.md
└── ARCHITECTURE.md           # Detailed architecture docs
```

### Building

```bash
npm run build
```

### Architecture

This server uses a **modular, layered architecture** for maintainability and scalability:

- **Protocol Layer** (`index.ts`): Handles MCP protocol and routing
- **Registry Layer** (`tool_registry.ts`): Central tool registration and discovery
- **Tool Modules** (`tools/*.ts`): Domain-specific tool implementations
- **Base Layer** (`base_tool.ts`): Shared functionality (retry, pagination, error handling)
- **Client Layer** (`client.ts`): HTTP communication with BlendVision API

For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

### Adding New Tools

To add support for additional BlendVision API endpoints:

1. **Create a tool module** in `src/tools/` (e.g., `meeting_tools.ts`)
2. **Extend BaseTool** and implement your methods
3. **Register tools** using the `registerTools()` static method
4. **Export** from `src/tools/index.ts`
5. **Initialize** in `src/index.ts`

Example:

```typescript
// src/tools/meeting_tools.ts
import { BaseTool } from './base_tool.js';

export class MeetingTools extends BaseTool {
  static registerTools(registry, instance) {
    registry.register({
      name: 'create_meeting',
      description: 'Create a new meeting',
      inputSchema: { /* ... */ }
    }, async (params) => instance.createMeeting(params));
  }

  async createMeeting(params) {
    // Use this.client, this.retry(), this.formatResponse()
  }
}
```

No need to modify existing code - the registry handles everything!

## Extending to Full API Coverage

This implementation currently covers the most commonly used endpoints. To add the remaining API categories:

### Remaining Categories
- AiSK (AI-powered streaming)
- Billing
- Word Filter
- Sticker
- Library
- Audio
- Meeting
- AOD (Audio on Demand)
- CMS
- Configuration
- Pricing

Follow the same pattern as existing tools to add these categories.

## License

MIT

## Support

For issues or questions:
- BlendVision API Documentation: https://developers.blendvision.com
- MCP Protocol: https://modelcontextprotocol.io
