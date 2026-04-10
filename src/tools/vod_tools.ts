import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * VOD (Video on Demand) Tools
 * Handles video management operations
 */
export class VODTools extends BaseTool {
  /**
   * Register all VOD tools to the registry
   */
  static registerTools(registry: ToolRegistry, instance: VODTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // List videos tool
    registry.register(
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
      async (params) => instance.listVideos(params)
    );

    // Get video tool
    registry.register(
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
      async (params) => instance.getVideo(params)
    );

    // Create video tool
    registry.register(
      {
        name: 'create_video',
        description: 'Create a new VOD video with encoding and security settings',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of VOD resource (required)'
            },
            profile_set_id: {
              type: 'string',
              description: 'Profile set unique id that defines encoding settings (required)'
            },
            source: {
              type: 'object',
              description: 'Source file configuration (required)',
              properties: {
                type: {
                  type: 'string',
                  enum: ['SOURCE_TYPE_LIBRARY', 'SOURCE_TYPE_CLOUD_STORAGE_AWS', 'SOURCE_TYPE_CLOUD_STORAGE_GCP', 'SOURCE_TYPE_CLOUD_STORAGE_AZURE'],
                  description: 'Source type'
                },
                library: {
                  type: 'object',
                  properties: {
                    video: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', description: 'Video file ID from library' }
                      }
                    },
                    subtitles: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          language_code: { type: 'string' }
                        }
                      }
                    },
                    stt_subtitles: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          language_code: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            queue: {
              type: 'string',
              enum: ['QUEUE_STANDARD', 'QUEUE_PRIORITY'],
              description: 'Encoding queue priority (required)',
              default: 'QUEUE_STANDARD'
            },
            security: {
              type: 'object',
              description: 'Security settings (required)',
              properties: {
                privacy: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['SECURITY_PRIVACY_TYPE_PUBLIC', 'SECURITY_PRIVACY_TYPE_TOKEN'],
                      description: 'Privacy type'
                    },
                    token: {
                      type: 'object',
                      properties: {
                        device_limit: { type: 'number', description: 'Concurrent device limit (0=unlimited, max 1000)' }
                      }
                    }
                  }
                },
                watermark: {
                  type: 'object',
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
                      ]
                    }
                  }
                },
                domain_control: {
                  type: 'object',
                  description: 'Domain control for iframe embedding'
                },
                protection: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['PROTECTION_TYPE_DRM'] }
                  }
                },
                geo_control: {
                  type: 'object',
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
            schedule: {
              type: 'object',
              description: 'Scheduling configuration (required)',
              properties: {
                enable: { type: 'boolean', description: 'Enable scheduling' },
                start_time: { type: 'string', description: 'Start time (ISO 8601)' },
                end_time: { type: 'string', description: 'End time (ISO 8601)' }
              }
            },
            pte: {
              type: 'object',
              description: 'Per-title encoding profile',
              properties: {
                target_quality: { type: 'string' },
                min_bitrate: { type: 'number' },
                max_bitrate: { type: 'number' }
              }
            },
            metadata: {
              type: 'object',
              description: 'VOD metadata',
              properties: {
                short_description: { type: 'string' },
                long_description: { type: 'string' },
                labels: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            export: {
              type: 'object',
              description: 'Cloud storage export settings'
            },
            byo_cdn: {
              type: 'object',
              description: 'Bring-your-own CDN settings'
            },
            player: {
              type: 'object',
              description: 'Player configuration',
              properties: {
                player_setting_id: { type: 'string' }
              }
            },
            permission: {
              type: 'object',
              description: 'Access role assignments',
              properties: {
                default_access_role: { type: 'string' },
                assignments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      assigned_type: { type: 'string' },
                      access_role: { type: 'string' }
                    }
                  }
                }
              }
            },
            mode: {
              type: 'string',
              enum: ['ENCODING_MODE_QUALITY_FIRST', 'ENCODING_MODE_SPEED_FIRST'],
              description: 'Encoding mode'
            },
            ...orgIdProperty,
          },
          required: ['name', 'profile_set_id', 'source', 'queue', 'security', 'schedule'],
        },
      },
      async (params) => instance.createVideo(params)
    );

    // Update video tool
    registry.register(
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
      async (params) => instance.updateVideo(params)
    );

    // Delete video tool
    registry.register(
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
      async (params) => instance.deleteVideo(params)
    );

    // Update VOD subtitles tool
    registry.register(
      {
        name: 'update_vod_subtitles',
        description: 'Update subtitles for a VOD video. Supports both library subtitle files and auto-generated STT subtitles.',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: {
              type: 'string',
              description: 'The VOD resource ID (required)'
            },
            subtitles: {
              type: 'array',
              description: 'Array of library subtitle files',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Library subtitle file ID (required)'
                  },
                  name: {
                    type: 'string',
                    description: 'Subtitle file name'
                  },
                  code: {
                    type: 'string',
                    description: 'Language code (ISO639-1+ISO-3166-1, e.g., en-US)'
                  },
                  display: {
                    type: 'string',
                    description: 'Display name for the subtitle track (required)'
                  },
                  translate_settings: {
                    type: 'array',
                    description: 'Translation settings for generating additional subtitle tracks',
                    items: {
                      type: 'object',
                      properties: {
                        source_lang_code: {
                          type: 'string',
                          description: 'Source language code (required)'
                        },
                        target_lang_code: {
                          type: 'string',
                          description: 'Target language code (required)'
                        },
                        display: {
                          type: 'string',
                          description: 'Display name for translated subtitle (required)'
                        }
                      },
                      required: ['source_lang_code', 'target_lang_code', 'display']
                    }
                  }
                },
                required: ['id', 'display']
              }
            },
            stt_subtitles: {
              type: 'array',
              description: 'Array of auto-generated speech-to-text subtitles',
              items: {
                type: 'object',
                properties: {
                  track_no: {
                    type: 'string',
                    description: 'Audio track number'
                  },
                  lang_code: {
                    type: 'string',
                    description: 'Language code for STT generation'
                  },
                  display: {
                    type: 'string',
                    description: 'Display name for the subtitle track (required)'
                  },
                  translate_settings: {
                    type: 'array',
                    description: 'Translation settings for STT subtitles',
                    items: {
                      type: 'object',
                      properties: {
                        source_lang_code: {
                          type: 'string',
                          description: 'Source language code (required)'
                        },
                        target_lang_code: {
                          type: 'string',
                          description: 'Target language code (required)'
                        },
                        display: {
                          type: 'string',
                          description: 'Display name for translated subtitle (required)'
                        }
                      },
                      required: ['source_lang_code', 'target_lang_code', 'display']
                    }
                  }
                },
                required: ['display']
              }
            },
            ...orgIdProperty,
          },
          required: ['videoId'],
        },
      },
      async (params) => instance.updateVodSubtitles(params)
    );
  }

  /**
   * List all videos
   */
  async listVideos(params: any) {
    try {
      const result = await this.client.listVideos(params);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a specific video
   */
  async getVideo(params: any) {
    try {
      const result = await this.client.getVideo(params.videoId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create a new video
   */
  async createVideo(params: any) {
    try {
      const { orgId, ...createData } = params;
      const result = await this.client.createVideo(createData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update an existing video
   */
  async updateVideo(params: any) {
    try {
      const { videoId, orgId, ...updateData } = params;
      const result = await this.client.updateVideo(videoId, updateData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete a video
   */
  async deleteVideo(params: any) {
    try {
      const result = await this.client.deleteVideo(params.videoId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update VOD subtitles
   */
  async updateVodSubtitles(params: any) {
    try {
      const { videoId, orgId, ...subtitleData } = params;
      const result = await this.client.updateVodSubtitles(videoId, subtitleData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
