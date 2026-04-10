import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Clips and Auto-tagging Tools
 * Handles video clips and auto-tagging operations
 */
export class ClipsTools extends BaseTool {
  static registerTools(registry: ToolRegistry, instance: ClipsTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // Clips tools
    registry.register(
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
      async (params) => instance.listClips(params)
    );

    registry.register(
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
      async (params) => instance.getClip(params)
    );

    registry.register(
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
      async (params) => instance.createClip(params)
    );

    registry.register(
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
      async (params) => instance.updateClip(params)
    );

    registry.register(
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
      async (params) => instance.deleteClip(params)
    );

    // Auto-tagging tools
    registry.register(
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
      async (params) => instance.getAutoTagging(params)
    );

    registry.register(
      {
        name: 'create_auto_tagging',
        description: 'Create auto-tagging for a VOD video source. Auto-tagging analyzes video content to generate metadata tags.',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'object',
              description: 'Source video information (required)',
              properties: {
                id: {
                  type: 'string',
                  description: 'VOD identifier (required)'
                },
                type: {
                  type: 'string',
                  description: 'Source type (required)',
                  enum: ['AUTO_TAGGING_SOURCE_TYPE_VOD'],
                  default: 'AUTO_TAGGING_SOURCE_TYPE_VOD'
                }
              },
              required: ['id', 'type']
            },
            subtitle_id: {
              type: 'string',
              description: 'Subtitle file ID (conditional - required if analyze_by is SUBTITLE_AND_AUDIO or only SUBTITLE)'
            },
            content_type: {
              type: 'string',
              description: 'Content type for analysis (optional)',
              enum: ['slide', 'ec', 'news']
            },
            content_topics: {
              type: 'array',
              description: 'Array of content topics (optional)',
              items: {
                type: 'string'
              }
            },
            analyze_by: {
              type: 'string',
              description: 'Analysis method (optional)',
              enum: ['VISUAL', 'AUDIO', 'SUBTITLE_AND_AUDIO']
            },
            ...orgIdProperty,
          },
          required: ['source'],
        },
      },
      async (params) => instance.createAutoTagging(params)
    );
  }

  async listClips(params: any) {
    try {
      const clipsParams = {
        'source.id': params.sourceId,
        'source.type': params.sourceType,
        ...(params.page && { page: params.page }),
        ...(params.pageSize && { pageSize: params.pageSize }),
        ...(params.orgId && { orgId: params.orgId }),
      };
      const result = await this.client.listClips(clipsParams);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getClip(params: any) {
    try {
      const result = await this.client.getClip(params.clipId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createClip(params: any) {
    try {
      const { orgId, ...clipCreateData } = params;
      const result = await this.client.createClip(clipCreateData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateClip(params: any) {
    try {
      const { clipId, orgId, ...clipUpdateData } = params;
      const result = await this.client.updateClip(clipId, clipUpdateData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteClip(params: any) {
    try {
      const result = await this.client.deleteClip(params.clipId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAutoTagging(params: any) {
    try {
      const autoTaggingParams = {
        'source.id': params.sourceId,
        'source.type': params.sourceType,
        ...(params.orgId && { orgId: params.orgId }),
      };
      const result = await this.client.getAutoTagging(autoTaggingParams);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createAutoTagging(params: any) {
    try {
      const { orgId, ...autoTaggingData } = params;
      const result = await this.client.createAutoTagging(autoTaggingData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
