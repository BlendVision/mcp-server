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
- `update_vod_subtitles` - Update subtitles for a VOD video

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

## Quick Start

### Step 1: Install

```bash
# Using npx (no installation required)
npx @blendvision/mcp-server

# Or install globally
npm install -g @blendvision/mcp-server
```

### Step 2: Configure Claude Desktop

Edit your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

### Step 3: Configure Claude Code

Add manually via command line:

```bash
claude mcp add --transport stdio --scope user blendvision \
  -- npx -y @blendvision/mcp-server
```

Then set your API token as an environment variable:

```bash
export BLENDVISION_API_TOKEN="your_token_here"
```

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

## License

MIT

## Contact Us

To obtain your **API Token** or if you have any questions, please reach out to us:

- **Email**: [support@blendvision.com](mailto:support@blendvision.com)
- **Website**: [https://www.blendvision.com](https://www.blendvision.com)
- **API Documentation**: [https://developers.blendvision.com](https://developers.blendvision.com)
