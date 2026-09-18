import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Configuration Tools
 * Encoding profile sets, which every VOD needs: create_video takes a
 * profile_set_id and there is no other way to find out which ones exist.
 */
export class ConfigurationTools extends BaseTool {
  static registerTools(registry: ToolRegistry, instance: ConfigurationTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // List profile sets
    registry.register(
      {
        name: 'list_profile_sets',
        description:
          'List the encoding profile sets available to the organization. Use this to find the ' +
          'profile_set_id that create_video requires — preset sets such as "H.264-1080P-30fps" ' +
          'come back with preset: true. Returns profile_sets plus pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            currentPage: {
              type: 'number',
              description: 'Page to fetch, 1-100. Defaults to 1.'
            },
            itemsPerPage: {
              type: 'number',
              description: 'Items per page, 1-100. Defaults to 100.'
            },
            preset: {
              type: 'string',
              enum: ['PRESET_ONLY', 'PRESET_EXCLUDE'],
              description:
                'PRESET_ONLY returns only BlendVision\'s built-in sets, PRESET_EXCLUDE only the ' +
                'organization\'s own. Omit for both.'
            },
            ...orgIdProperty,
          },
        },
      },
      async (params) => instance.listProfileSets(params)
    );

    // Get profile set
    registry.register(
      {
        name: 'get_profile_set',
        description:
          'Get one encoding profile set by ID, including the individual renditions it encodes to.',
        inputSchema: {
          type: 'object',
          properties: {
            profileSetId: { type: 'string', description: 'The profile set ID' },
            ...orgIdProperty,
          },
          required: ['profileSetId'],
        },
      },
      async (params) => instance.getProfileSet(params)
    );
  }

  async listProfileSets(params: any) {
    try {
      // Both paging fields are required by the API; an agent asking for "the
      // profile sets" means all of them, so page through nothing by default.
      const query: Record<string, any> = {
        current_page: params.currentPage ?? 1,
        items_per_page: params.itemsPerPage ?? 100,
      };

      if (params.preset) {
        query['filter.preset'] = params.preset;
      }

      const result = await this.client.listProfileSets(query, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getProfileSet(params: any) {
    try {
      const result = await this.client.getProfileSet(params.profileSetId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
