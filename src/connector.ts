#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { BlendVisionClient } from './client.js';
import type { BlendVisionConfig } from './types.js';
import express from 'express';
import { randomUUID } from 'crypto';


// Common property for all tools to support dynamic org_id override
const orgIdProperty = {
  orgId: {
    type: 'string',
    description: 'Organization ID (optional - overrides the org_id from connection URL)'
  }
};

// Tool definitions
const tools: Tool[] = [
  // VOD Tools
  {
    name: 'list_videos',
    description: 'List all video-on-demand (VOD) videos with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number for pagination' },
        pageSize: { type: 'number', description: 'Number of items per page' },
        status: { type: 'string', description: 'Filter by video status (PROCESSING, READY, FAILED)' },
        ...orgIdProperty,
      },
    },
  },
  {
    name: 'get_video',
    description: 'Get details of a specific VOD video by ID',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'The video ID' },
        ...orgIdProperty,
      },
      required: ['videoId'],
    },
  },
  {
    name: 'create_video',
    description: 'Create a new VOD video',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Video title' },
        description: { type: 'string', description: 'Video description' },
        resourceId: { type: 'string', description: 'Associated resource ID' },
        ...orgIdProperty,
      },
      required: ['title'],
    },
  },
  {
    name: 'update_video',
    description: 'Update an existing VOD video',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'The video ID' },
        title: { type: 'string', description: 'New video title' },
        description: { type: 'string', description: 'New video description' },
        ...orgIdProperty,
      },
      required: ['videoId'],
    },
  },
  {
    name: 'delete_video',
    description: 'Delete a VOD video',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'The video ID to delete' },
        ...orgIdProperty,
      },
      required: ['videoId'],
    },
  },

  // VOD Download Tools
  {
    name: 'create_vod_download',
    description: 'Trigger a remux of the specified VOD rendition (identified by profile_id) to a standalone MP4 file stored in Library. The response includes a vod_download.id for polling status. When status reaches "Done", use the vod_download.library_id with the file download endpoint to obtain a presigned URL.',
    inputSchema: {
      type: 'object',
      properties: {
        vodId: { type: 'string', description: 'The VOD resource ID' },
        profile_id: { type: 'string', description: 'The profile ID identifying which rendition to download' },
        ...orgIdProperty,
      },
      required: ['vodId', 'profile_id'],
    },
  },
  {
    name: 'get_vod_download',
    description: 'Fetch the status and details of a specific VOD download job. Use this to poll the download status after creating a VOD download.',
    inputSchema: {
      type: 'object',
      properties: {
        vodId: { type: 'string', description: 'The VOD resource ID' },
        downloadId: { type: 'string', description: 'The download job ID' },
        ...orgIdProperty,
      },
      required: ['vodId', 'downloadId'],
    },
  },
  {
    name: 'list_vod_downloads',
    description: 'List all download jobs associated with a specific VOD resource.',
    inputSchema: {
      type: 'object',
      properties: {
        vodId: { type: 'string', description: 'The VOD resource ID' },
        ...orgIdProperty,
      },
      required: ['vodId'],
    },
  },

  // Live Streaming Tools
  {
    name: 'list_live_channels',
    description: 'List all live streaming channels',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number for pagination' },
        pageSize: { type: 'number', description: 'Number of items per page' },
        ...orgIdProperty,
      },
    },
  },
  {
    name: 'get_live_channel',
    description: 'Get details of a specific live channel by ID',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The channel ID' },
        ...orgIdProperty,
      },
      required: ['channelId'],
    },
  },
  {
    name: 'create_live_channel',
    description: 'Create a new live streaming channel',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name' },
        description: { type: 'string', description: 'Channel description' },
        profileId: { type: 'string', description: 'Encoding profile ID' },
        ...orgIdProperty,
      },
      required: ['name'],
    },
  },
  {
    name: 'update_live_channel',
    description: 'Update an existing live channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The channel ID' },
        name: { type: 'string', description: 'New channel name' },
        description: { type: 'string', description: 'New channel description' },
        ...orgIdProperty,
      },
      required: ['channelId'],
    },
  },
  {
    name: 'delete_live_channel',
    description: 'Delete a live channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The channel ID to delete' },
        ...orgIdProperty,
      },
      required: ['channelId'],
    },
  },
  {
    name: 'start_live',
    description: 'Start a live streaming session',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The channel ID to start' },
        ...orgIdProperty,
      },
      required: ['channelId'],
    },
  },
  {
    name: 'stop_live',
    description: 'Stop a live streaming session',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The channel ID to stop' },
        ...orgIdProperty,
      },
      required: ['channelId'],
    },
  },

  // Chatroom Tools
  {
    name: 'list_chatrooms',
    description: 'List all chatrooms',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number for pagination' },
        pageSize: { type: 'number', description: 'Number of items per page' },
        ...orgIdProperty,
      },
    },
  },
  {
    name: 'get_chatroom',
    description: 'Get details of a specific chatroom by ID',
    inputSchema: {
      type: 'object',
      properties: {
        chatroomId: { type: 'string', description: 'The chatroom ID' },
        ...orgIdProperty,
      },
      required: ['chatroomId'],
    },
  },
  {
    name: 'create_chatroom',
    description: 'Create a new chatroom',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Chatroom name' },
        description: { type: 'string', description: 'Chatroom description' },
        ...orgIdProperty,
      },
      required: ['name'],
    },
  },
  {
    name: 'send_chatroom_message',
    description: 'Send a message to a chatroom',
    inputSchema: {
      type: 'object',
      properties: {
        chatroomId: { type: 'string', description: 'The chatroom ID' },
        message: { type: 'string', description: 'Message content' },
        userId: { type: 'string', description: 'User ID sending the message' },
        ...orgIdProperty,
      },
      required: ['chatroomId', 'message'],
    },
  },

  // Account & Organization Tools
  {
    name: 'get_account',
    description: 'Get current account information',
    inputSchema: {
      type: 'object',
      properties: {
        ...orgIdProperty,
      },
    },
  },
  {
    name: 'list_organizations',
    description: 'List all organizations accessible to the account',
    inputSchema: {
      type: 'object',
      properties: {
        ...orgIdProperty,
      },
    },
  },

  // Playback Tools
  {
    name: 'generate_playback_token',
    description: 'Generate a playback token for accessing protected content',
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: { type: 'string', description: 'The resource ID (video or channel)' },
        resourceType: { type: 'string', enum: ['VOD', 'LIVE'], description: 'Resource type' },
        deviceId: { type: 'string', description: 'Device ID for playback tracking' },
        expiration: { type: 'number', description: 'Token expiration in seconds' },
        ...orgIdProperty,
      },
      required: ['resourceId', 'resourceType'],
    },
  },
  {
    name: 'list_playback_codes',
    description: 'List playback codes for a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: { type: 'string', description: 'The resource ID' },
        ...orgIdProperty,
      },
      required: ['resourceId'],
    },
  },

  // Analytics Tools
  {
    name: 'get_analytics',
    description: 'Get analytics reports with various metrics',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in ISO format' },
        endDate: { type: 'string', description: 'End date in ISO format' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to retrieve' },
        resourceId: { type: 'string', description: 'Filter by specific resource ID' },
        ...orgIdProperty,
      },
    },
  },
  {
    name: 'get_cdn_usage_report',
    description: 'Get CDN usage report for bandwidth and traffic analysis',
    inputSchema: {
      type: 'object',
      properties: {
        time: {
          type: 'string',
          description: 'Time in date-time format (e.g., 2024-01-01T00:00:00Z)',
          format: 'date-time',
        },
        streamingType: {
          type: 'string',
          description: 'Streaming type for the report',
          enum: ['CDN_REPORT_STREAMING_TYPE_LIVE', 'CDN_REPORT_STREAMING_TYPE_VOD', 'CDN_REPORT_STREAMING_TYPE_LIVE_TO_VOD'],
        },
        ...orgIdProperty,
      },
      required: ['time', 'streamingType'],
    },
  },
  {
    name: 'query_default_usage_charts',
    description: 'Query default usage charts with time range and filters',
    inputSchema: {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          description: 'Start time in ISO format (e.g., 2026-02-19T16:00:00.000Z)',
          format: 'date-time',
        },
        endTime: {
          type: 'string',
          description: 'End time in ISO format (e.g., 2026-03-19T16:00:00.000Z)',
          format: 'date-time',
        },
        analyticsStreamingType: {
          type: 'string',
          description: 'Analytics streaming type',
          enum: ['STREAMING_TYPE_UNSPECIFIED', 'STREAMING_TYPE_LIVE', 'STREAMING_TYPE_VOD', 'STREAMING_TYPE_LIVE_TO_VOD'],
        },
        businessOrgIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of business organization IDs',
        },
        timeGranularity: {
          type: 'string',
          description: 'Time granularity for the report',
          enum: ['TIME_GRANULARITY_UNSPECIFIED', 'TIME_GRANULARITY_DAY', 'TIME_GRANULARITY_HOUR', 'TIME_GRANULARITY_MONTH'],
        },
        usageType: {
          type: 'string',
          description: 'Usage type',
          enum: ['USAGE_TYPE_UNSPECIFIED', 'USAGE_TYPE_CDN', 'USAGE_TYPE_TRANSCODING'],
        },
        ...orgIdProperty,
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'get_user_access_chart',
    description: 'Get user access analytics chart with viewer and visit counts',
    inputSchema: {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          description: 'Start time in ISO format (e.g., 2026-02-20T16:00:00.000Z)',
          format: 'date-time',
        },
        endTime: {
          type: 'string',
          description: 'End time in ISO format (e.g., 2026-03-20T16:00:00.000Z)',
          format: 'date-time',
        },
        timeGranularity: {
          type: 'string',
          description: 'Time granularity for the report',
          enum: ['TIME_GRANULARITY_UNSPECIFIED', 'TIME_GRANULARITY_DAY', 'TIME_GRANULARITY_HOUR', 'TIME_GRANULARITY_MONTH'],
        },
        businessOrgIds: {
          type: 'string',
          description: 'Business organization ID (comma-separated if multiple)',
        },
        ...orgIdProperty,
      },
      required: ['startTime', 'endTime'],
    },
  },

  // Clips Tools
  {
    name: 'list_clips',
    description: 'List video clips from a specific source',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'The source ID (video or live)' },
        sourceType: {
          type: 'string',
          description: 'Source type',
          enum: ['CLIP_SOURCE_TYPE_VOD', 'CLIP_SOURCE_TYPE_LIVE'],
        },
        page: { type: 'number', description: 'Page number for pagination' },
        pageSize: { type: 'number', description: 'Number of items per page' },
        ...orgIdProperty,
      },
      required: ['sourceId', 'sourceType'],
    },
  },
  {
    name: 'get_clip',
    description: 'Get details of a specific clip by ID',
    inputSchema: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: 'The clip ID' },
        ...orgIdProperty,
      },
      required: ['clipId'],
    },
  },
  {
    name: 'create_clip',
    description: 'Create a new video clip',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Clip title' },
        description: { type: 'string', description: 'Clip description' },
        sourceId: { type: 'string', description: 'Source video ID' },
        startTime: { type: 'number', description: 'Start time in seconds' },
        endTime: { type: 'number', description: 'End time in seconds' },
        ...orgIdProperty,
      },
      required: ['title', 'sourceId', 'startTime', 'endTime'],
    },
  },
  {
    name: 'update_clip',
    description: 'Update an existing clip',
    inputSchema: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: 'The clip ID' },
        title: { type: 'string', description: 'New clip title' },
        description: { type: 'string', description: 'New clip description' },
        ...orgIdProperty,
      },
      required: ['clipId'],
    },
  },
  {
    name: 'delete_clip',
    description: 'Delete a video clip',
    inputSchema: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: 'The clip ID to delete' },
        ...orgIdProperty,
      },
      required: ['clipId'],
    },
  },

  // Auto-tagging Tools
  {
    name: 'get_auto_tagging',
    description: 'Get auto-tagging results for a video source',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'The source ID (VOD ID)' },
        sourceType: {
          type: 'string',
          description: 'Source type',
          enum: ['AUTO_TAGGING_SOURCE_TYPE_VOD'],
        },
        ...orgIdProperty,
      },
      required: ['sourceId', 'sourceType'],
    },
  },
];

// Create a per-session MCP server with its own BlendVision client
function createSessionServer(client: BlendVisionClient): Server {
  const server = new Server(
    {
      name: 'blendvision-mcp-server',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = args as Record<string, any>;

    try {
      let result;

      switch (name) {
        // VOD operations
        case 'list_videos':
          result = await client.listVideos(params);
          break;
        case 'get_video':
          result = await client.getVideo(params.videoId, params.orgId);
          break;
        case 'create_video': {
          const { orgId, ...createData } = params;
          result = await client.createVideo(createData, orgId);
          break;
        }
        case 'update_video': {
          const { videoId, orgId, ...updateData } = params;
          result = await client.updateVideo(videoId, updateData, orgId);
          break;
        }
        case 'delete_video':
          result = await client.deleteVideo(params.videoId, params.orgId);
          break;

        // VOD Download operations
        case 'create_vod_download': {
          const { vodId, orgId, ...dlData } = params;
          result = await client.createVodDownload(vodId, dlData, orgId);
          break;
        }
        case 'get_vod_download':
          result = await client.getVodDownload(params.vodId, params.downloadId, params.orgId);
          break;
        case 'list_vod_downloads':
          result = await client.listVodDownloads(params.vodId, params.orgId);
          break;

        // Live operations
        case 'list_live_channels':
          result = await client.listLiveChannels(params);
          break;
        case 'get_live_channel':
          result = await client.getLiveChannel(params.channelId, params.orgId);
          break;
        case 'create_live_channel': {
          const { orgId, ...data } = params;
          result = await client.createLiveChannel(data, orgId);
          break;
        }
        case 'update_live_channel': {
          const { channelId, orgId, ...data } = params;
          result = await client.updateLiveChannel(channelId, data, orgId);
          break;
        }
        case 'delete_live_channel':
          result = await client.deleteLiveChannel(params.channelId, params.orgId);
          break;
        case 'start_live':
          result = await client.startLive(params.channelId, params.orgId);
          break;
        case 'stop_live':
          result = await client.stopLive(params.channelId, params.orgId);
          break;

        // Chatroom operations
        case 'list_chatrooms':
          result = await client.listChatrooms(params);
          break;
        case 'get_chatroom':
          result = await client.getChatroom(params.chatroomId, params.orgId);
          break;
        case 'create_chatroom': {
          const { orgId, ...data } = params;
          result = await client.createChatroom(data, orgId);
          break;
        }
        case 'send_chatroom_message': {
          const { chatroomId, orgId, ...data } = params;
          result = await client.sendMessage(chatroomId, data, orgId);
          break;
        }

        // Account operations
        case 'get_account':
          result = await client.getAccount(params.orgId);
          break;
        case 'list_organizations':
          result = await client.listOrganizations(params.orgId);
          break;

        // Playback operations
        case 'generate_playback_token': {
          const { orgId, ...data } = params;
          result = await client.generatePlaybackToken(data, orgId);
          break;
        }
        case 'list_playback_codes':
          result = await client.listPlaybackCodes(params.resourceId, params.orgId);
          break;

        // Analytics operations
        case 'get_analytics': {
          const { orgId, ...analyticsParams } = params;
          result = await client.getAnalytics(analyticsParams, orgId);
          break;
        }
        case 'get_cdn_usage_report':
          result = await client.getCdnUsageReport({
            time: params.time,
            streaming_type: params.streamingType,
          }, params.orgId);
          break;
        case 'query_default_usage_charts':
          result = await client.queryDefaultUsageCharts({
            start_time: params.startTime,
            end_time: params.endTime,
            ...(params.analyticsStreamingType && { analytics_streaming_type: params.analyticsStreamingType }),
            ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
            ...(params.timeGranularity && { time_granularity: params.timeGranularity }),
            ...(params.usageType && { usage_type: params.usageType }),
          }, params.orgId);
          break;
        case 'get_user_access_chart':
          result = await client.getUserAccessChart({
            start_time: params.startTime,
            end_time: params.endTime,
            ...(params.timeGranularity && { time_granularity: params.timeGranularity }),
            ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
          }, params.orgId);
          break;

        // Clips operations
        case 'list_clips':
          result = await client.listClips({
            'source.id': params.sourceId,
            'source.type': params.sourceType,
            ...(params.page && { page: params.page }),
            ...(params.pageSize && { pageSize: params.pageSize }),
            ...(params.orgId && { orgId: params.orgId }),
          });
          break;
        case 'get_clip':
          result = await client.getClip(params.clipId, params.orgId);
          break;
        case 'create_clip': {
          const { orgId, ...data } = params;
          result = await client.createClip(data, orgId);
          break;
        }
        case 'update_clip': {
          const { clipId, orgId, ...data } = params;
          result = await client.updateClip(clipId, data, orgId);
          break;
        }
        case 'delete_clip':
          result = await client.deleteClip(params.clipId, params.orgId);
          break;

        // Auto-tagging operations
        case 'get_auto_tagging':
          result = await client.getAutoTagging({
            'source.id': params.sourceId,
            'source.type': params.sourceType,
            ...(params.orgId && { orgId: params.orgId }),
          });
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      if (result.error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Unknown error occurred' } }, null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}

// Streamable HTTP server
async function main() {
  const PORT = process.env.PORT || 3000;
  const app = express();
  app.use(express.json());

  // Store transports by session ID
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

  // Extract token from Authorization header (Bearer token) or query param
  function extractToken(req: express.Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return req.query.token as string | undefined;
  }

  // POST /mcp - Main Streamable HTTP endpoint
  app.post('/mcp', async (req, res) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Missing API token. Provide via Authorization: Bearer <token> header or ?token= query param.' },
        id: null,
      });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session: reject if session ID was provided but not found
    if (sessionId) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      });
      return;
    }

    // Create new session
    const orgId = req.query.org_id as string | undefined;
    const client = new BlendVisionClient({
      apiToken: token,
      organizationId: orgId || '',
      baseUrl: process.env.BLENDVISION_BASE_URL,
    });

    const server = createSessionServer(client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const newSessionId = transport.sessionId;
    if (newSessionId) {
      sessions.set(newSessionId, { transport, server });
    }

    // Clean up on close
    transport.onclose = () => {
      if (newSessionId) {
        sessions.delete(newSessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // GET /mcp - SSE stream for server-initiated messages
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      });
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  // DELETE /mcp - Close session
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      });
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.3.0' });
  });

  app.listen(PORT, () => {
    console.error(`BlendVision MCP Server running on http://localhost:${PORT}`);
    console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
