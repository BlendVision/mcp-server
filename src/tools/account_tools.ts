import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Account and Playback Tools
 * Handles account, organization, and playback token operations
 */
export class AccountTools extends BaseTool {
  static registerTools(registry: ToolRegistry, instance: AccountTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // Account tools
    registry.register(
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
      async (params) => instance.getAccount(params)
    );

    registry.register(
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
      async (params) => instance.listOrganizations(params)
    );

    registry.register(
      {
        name: 'list_hierarchical_sub_organizations',
        description: 'List all hierarchical sub-organizations under a reseller organization',
        inputSchema: {
          type: 'object',
          properties: {
            ...orgIdProperty,
          },
        },
      },
      async (params) => instance.listHierarchicalSubOrganizations(params)
    );

    // Playback tools
    registry.register(
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
      async (params) => instance.generatePlaybackToken(params)
    );

    registry.register(
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
      async (params) => instance.listPlaybackCodes(params)
    );
  }

  async getAccount(params: any) {
    try {
      const result = await this.client.getAccount(params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listOrganizations(params: any) {
    try {
      const result = await this.client.listOrganizations(params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listHierarchicalSubOrganizations(params: any) {
    try {
      const result = await this.client.listHierarchicalSubOrganizations(params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async generatePlaybackToken(params: any) {
    try {
      const { orgId, ...playbackData } = params;
      const result = await this.client.generatePlaybackToken(playbackData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listPlaybackCodes(params: any) {
    try {
      const result = await this.client.listPlaybackCodes(params.resourceId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
