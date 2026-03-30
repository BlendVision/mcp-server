import { Tool } from '@modelcontextprotocol/sdk/types.js';
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
}
