import { Tool } from '@modelcontextprotocol/sdk/types.js';
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
}
