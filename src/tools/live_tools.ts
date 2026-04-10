import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Live Streaming Tools
 * Handles live channel and streaming operations
 */
export class LiveTools extends BaseTool {
  /**
   * Register all Live streaming tools to the registry
   */
  static registerTools(registry: ToolRegistry, instance: LiveTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // List live channels
    registry.register(
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
      async (params) => instance.listLiveChannels(params)
    );

    // Get live channel
    registry.register(
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
      async (params) => instance.getLiveChannel(params)
    );

    // Create live channel
    registry.register(
      {
        name: 'create_live_channel',
        description: 'Create a new live streaming channel with comprehensive configuration options including ULL, security, recording, and more',
        inputSchema: {
          type: 'object',
          properties: {
            // Core configuration
            name: {
              type: 'string',
              description: 'Live event title (max 100 characters)'
            },
            custom_id: {
              type: 'string',
              description: 'Unique identifier (1-150 chars, alphanumeric with ._-)'
            },
            type: {
              type: 'string',
              enum: ['LIVE_TYPE_LIVE', 'LIVE_TYPE_SIMULIVE'],
              description: 'Live event type (immutable)'
            },
            broadcast_mode: {
              type: 'string',
              enum: ['BROADCAST_MODE_TRADITIONAL_LIVE', 'BROADCAST_MODE_PLAYBACK', 'BROADCAST_MODE_DVR'],
              description: 'Broadcast mode (immutable)'
            },
            resolution: {
              type: 'string',
              enum: ['LIVE_RESOLUTION_HD', 'LIVE_RESOLUTION_FHD', 'LIVE_RESOLUTION_4K'],
              description: 'Video resolution: HD (720p), FHD (1080p), or 4K (3840×2160) (immutable)'
            },

            // Simulive configuration
            source: {
              type: 'object',
              description: 'Source configuration (required if type is LIVE_TYPE_SIMULIVE)',
              properties: {
                type: { type: 'string', enum: ['LIVE_SOURCE_TYPE_LIBRARY'] },
                library: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Video library ID' }
                  }
                }
              }
            },
            scheduled_at: {
              type: 'string',
              description: 'Scheduled start time (ISO 8601 datetime)'
            },

            // Recording & VOD
            live_vod: {
              type: 'object',
              description: 'Recording and VOD configuration',
              properties: {
                source: {
                  type: 'string',
                  enum: ['LIVE_VOD_SOURCE_CATCHUP', 'LIVE_VOD_SOURCE_REPLACE', 'LIVE_VOD_SOURCE_PLAYBACK'],
                  description: 'VOD source type'
                },
                replace: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'VOD ID for replacement' }
                  }
                },
                playback: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'VOD ID for playback' },
                    started_at: { type: 'string', description: 'Playback start time' },
                    ended_at: { type: 'string', description: 'Playback end time' }
                  }
                }
              }
            },

            // Security settings
            security: {
              type: 'object',
              description: 'Security configuration',
              properties: {
                privacy: {
                  type: 'object',
                  description: 'Privacy settings (required)',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['SECURITY_PRIVACY_TYPE_PUBLIC', 'SECURITY_PRIVACY_TYPE_TOKEN'],
                      description: 'Privacy type'
                    },
                    token: {
                      type: 'object',
                      properties: {
                        device_limit: {
                          type: 'number',
                          description: 'Concurrent device limit (0=unlimited, max 1000)'
                        }
                      }
                    }
                  }
                },
                watermark: {
                  type: 'object',
                  description: 'Watermark configuration',
                  properties: {
                    enabled: { type: 'boolean' },
                    type: {
                      type: 'string',
                      enum: ['WATERMARK_TYPE_IMAGE', 'WATERMARK_TYPE_USER_ID']
                    },
                    position: {
                      type: 'string',
                      enum: [
                        'WATERMARK_POSITION_TOP_LEFT', 'WATERMARK_POSITION_TOP_CENTER',
                        'WATERMARK_POSITION_TOP_RIGHT', 'WATERMARK_POSITION_MIDDLE_LEFT',
                        'WATERMARK_POSITION_MIDDLE_CENTER', 'WATERMARK_POSITION_MIDDLE_RIGHT',
                        'WATERMARK_POSITION_BOTTOM_LEFT', 'WATERMARK_POSITION_BOTTOM_CENTER',
                        'WATERMARK_POSITION_BOTTOM_RIGHT', 'WATERMARK_POSITION_CUSTOM'
                      ],
                      description: 'Watermark position'
                    }
                  }
                },
                domain_control: {
                  type: 'object',
                  description: 'Domain control for iframe embedding'
                },
                protection: {
                  type: 'object',
                  description: 'DRM protection',
                  properties: {
                    type: { type: 'string', enum: ['PROTECTION_TYPE_DRM'] }
                  }
                },
                geo_control: {
                  type: 'object',
                  description: 'Geographic access control',
                  properties: {
                    allowed_countries: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Array of ISO 3166-1 alpha-2 country codes'
                    },
                    blocked_countries: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Array of ISO 3166-1 alpha-2 country codes'
                    }
                  }
                }
              }
            },

            // Streaming options
            ull_enabled: {
              type: 'boolean',
              description: 'Enable ultra-low-latency streaming'
            },
            ingest_types: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['LIVE_STREAM_INGEST_TYPE_RTMP', 'LIVE_STREAM_INGEST_TYPE_SRT']
              },
              description: 'Ingest types (default: RTMP)'
            },
            relay_settings: {
              type: 'array',
              description: 'Stream relay settings for multi-platform streaming',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['RELAY_TYPE_RTMP'] },
                  rtmp: {
                    type: 'object',
                    properties: {
                      url: { type: 'string', description: 'RTMP server URL' },
                      stream_key: { type: 'string', description: 'RTMP stream key' }
                    }
                  }
                }
              }
            },
            remux_only: {
              type: 'boolean',
              description: 'Remux without transcoding (immutable)'
            },
            backup_stream_enabled: {
              type: 'boolean',
              description: 'Enable backup stream (default: false)'
            },
            save_for_download_enabled: {
              type: 'boolean',
              description: 'Enable save for download'
            },

            // Media & interaction
            cover_images: {
              type: 'object',
              description: 'Cover images for different player states',
              properties: {
                ready_to_start: { type: 'object' },
                preview: { type: 'object' },
                player_pause: { type: 'object' },
                signal_interruption: { type: 'object' },
                end: { type: 'object' },
                close: { type: 'object' }
              }
            },
            interaction: {
              type: 'object',
              description: 'Interaction features',
              properties: {
                poll_enabled: { type: 'boolean' },
                chatroom: {
                  type: 'object',
                  properties: {
                    live: {
                      type: 'object',
                      properties: {
                        enabled: { type: 'boolean' },
                        theme: {
                          type: 'string',
                          enum: ['CHATROOM_THEME_LIGHT', 'CHATROOM_THEME_DARK']
                        },
                        mode: {
                          type: 'string',
                          enum: ['CHATROOM_MODE_FREE_TALK', 'CHATROOM_MODE_ALL_TO_ONE']
                        }
                      }
                    },
                    vod: {
                      type: 'object',
                      properties: {
                        enabled: { type: 'boolean' },
                        theme: {
                          type: 'string',
                          enum: ['CHATROOM_THEME_LIGHT', 'CHATROOM_THEME_DARK']
                        },
                        mode: {
                          type: 'string',
                          enum: ['CHATROOM_MODE_FREE_TALK', 'CHATROOM_MODE_ALL_TO_ONE']
                        }
                      }
                    }
                  }
                }
              }
            },
            metadata: {
              type: 'object',
              description: 'Metadata with descriptions and labels',
              properties: {
                description: { type: 'string' },
                labels: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Max 20 labels'
                }
              }
            },
            showroom: {
              type: 'object',
              description: 'Showroom configuration with library assets'
            },
            questionnaire: {
              type: 'object',
              description: 'Survey/questionnaire configuration',
              properties: {
                form_id: { type: 'string' }
              }
            },
            byo_cdn: {
              type: 'object',
              description: 'Bring-your-own CDN settings'
            },
            player: {
              type: 'object',
              description: 'Player configuration',
              properties: {
                player_setting_id: { type: 'string', description: 'Player configuration ID' }
              }
            },

            ...orgIdProperty,
          },
          required: ['type', 'broadcast_mode', 'resolution'],
        },
      },
      async (params) => instance.createLiveChannel(params)
    );

    // Update live channel
    registry.register(
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
      async (params) => instance.updateLiveChannel(params)
    );

    // Delete live channel
    registry.register(
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
      async (params) => instance.deleteLiveChannel(params)
    );

    // Start live
    registry.register(
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
      async (params) => instance.startLive(params)
    );

    // Stop live
    registry.register(
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
      async (params) => instance.stopLive(params)
    );

    // Cancel live
    registry.register(
      {
        name: 'cancel_live_channel',
        description: 'Cancel a live streaming session. Terminates and archives the live stream. Only works when status is SCHEDULED, WAIT_FOR_PREVIEW, PREVIEW, LIVE, VOD_READY, or VOD.',
        inputSchema: {
          type: 'object',
          properties: {
            channelId: { type: 'string', description: 'The channel ID to cancel' },
            ...orgIdProperty,
          },
          required: ['channelId'],
        },
      },
      async (params) => instance.cancelLive(params)
    );

    // Archive live
    registry.register(
      {
        name: 'archive_live_channel',
        description: 'Archive a live stream, making it inaccessible for future use. Only works when status is WAIT_FOR_PREVIEW, PREVIEW, LIVE, CLOSED, or any FAIL_TO_* status.',
        inputSchema: {
          type: 'object',
          properties: {
            channelId: { type: 'string', description: 'The channel ID to archive' },
            ...orgIdProperty,
          },
          required: ['channelId'],
        },
      },
      async (params) => instance.archiveLive(params)
    );
  }

  async listLiveChannels(params: any) {
    try {
      const result = await this.client.listLiveChannels(params);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getLiveChannel(params: any) {
    try {
      const result = await this.client.getLiveChannel(params.channelId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createLiveChannel(params: any) {
    try {
      const { orgId, ...createData } = params;
      const result = await this.client.createLiveChannel(createData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateLiveChannel(params: any) {
    try {
      const { channelId, orgId, ...updateData } = params;
      const result = await this.client.updateLiveChannel(channelId, updateData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteLiveChannel(params: any) {
    try {
      const result = await this.client.deleteLiveChannel(params.channelId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async startLive(params: any) {
    try {
      const result = await this.client.startLive(params.channelId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async stopLive(params: any) {
    try {
      const result = await this.client.stopLive(params.channelId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelLive(params: any) {
    try {
      const result = await this.client.cancelLive(params.channelId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async archiveLive(params: any) {
    try {
      const result = await this.client.archiveLive(params.channelId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
