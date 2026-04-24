# BlendVision MCP Server

Model Context Protocol (MCP) server for BlendVision One API. This server enables AI assistants to interact with BlendVision's video platform services including VOD, live streaming, chatrooms, and analytics.

## Features

### Supported API Categories

- **Video On Demand (VOD)**: Create, manage, and query video content
- **Live Streaming**: Manage live channels and streaming sessions
- **Library & File Management**: Upload, update, download, and manage files in BlendVision library
- **Clips & Auto-tagging**: Create and manage video clips with AI-powered auto-tagging
- **Meeting**: Create and manage video meetings
- **Chatroom**: Create and manage real-time chat experiences
- **Account & Organization**: Access account information and organization details
- **Playback**: Generate playback tokens and manage access codes
- **Analytics**: Retrieve analytics, CDN usage, and streaming metrics

### Available Tools

#### VOD Tools
- `list_videos` - List all videos with filtering options
- `get_video` - Get video details by ID
- `create_video` - Create a new video
- `update_video` - Update video metadata
- `delete_video` - Delete a video
- `update_vod_subtitles` - Update subtitles for a VOD video
- `create_vod_download` - Trigger a VOD rendition download as MP4
- `get_vod_download` - Get status of a VOD download job
- `list_vod_downloads` - List all download jobs for a VOD

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

#### Library & File Tools
- `upload_file` - Initiate file upload and get presigned URLs
- `complete_file_upload` - Complete file upload session after uploading parts
- `cancel_file_upload` - Cancel an in-progress file upload session
- `get_file` - Get file details by ID
- `update_file` - Update file details (name, metadata, attributes)
- `delete_file` - Delete a file from library
- `download_file` - Get a download link for a file

#### Clips & Auto-tagging Tools
- `list_clips` - List video clips from a specific source
- `get_clip` - Get clip details by ID
- `create_clip` - Create a new video clip
- `update_clip` - Update clip metadata
- `delete_clip` - Delete a video clip
- `get_auto_tagging` - Get auto-tagging results for a video source
- `create_auto_tagging` - Create auto-tagging for a VOD video

#### Meeting Tools
- `create_meeting` - Create a new meeting with schedule configuration
- `get_meeting` - Get meeting details by ID
- `get_meeting_session_info` - Get meeting session info and participant tokens
- `archive_meeting` - Archive a meeting

#### Chatroom Tools
- `list_chatrooms` - List all chatrooms
- `get_chatroom` - Get chatroom details
- `create_chatroom` - Create a new chatroom
- `send_chatroom_message` - Send a message to a chatroom

#### Account & Organization Tools
- `get_account` - Get current account information
- `list_organizations` - List accessible organizations
- `list_hierarchical_sub_organizations` - List hierarchical sub-organizations

#### Playback Tools
- `generate_playback_token` - Generate tokens for content access
- `list_playback_codes` - List playback codes for a resource

#### Analytics Tools
- `get_analytics` - Retrieve analytics reports
- `get_cdn_usage_report` - Get CDN usage report for bandwidth and traffic
- `query_default_usage_charts` - Query default usage charts with time range
- `get_user_access_chart` - Get user access analytics chart
- `query_usage_summary` - Query usage summary analytics

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
