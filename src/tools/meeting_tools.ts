import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Meeting Tools
 * Handles meeting operations
 */
export class MeetingTools extends BaseTool {
  /**
   * Register all Meeting tools to the registry
   */
  static registerTools(registry: ToolRegistry, instance: MeetingTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // Create meeting
    registry.register(
      {
        name: 'create_meeting',
        description: 'Create a new meeting with schedule configuration. Meeting duration cannot exceed 12 hours.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The meeting name'
            },
            schedule: {
              type: 'object',
              description: 'Meeting timing configuration (duration cannot exceed 12 hours)',
              properties: {
                started_at: {
                  type: 'string',
                  description: 'Timestamp indicating when the meeting becomes available (ISO 8601 datetime)'
                },
                closed_at: {
                  type: 'string',
                  description: 'Timestamp indicating when the meeting becomes unavailable (ISO 8601 datetime)'
                }
              },
              required: ['started_at', 'closed_at']
            },
            max_participants: {
              type: 'number',
              description: 'Maximum allowed participants (default: 10, max: 100). Reserved for future use.'
            },
            ...orgIdProperty,
          },
          required: ['schedule'],
        },
      },
      async (params) => instance.createMeeting(params)
    );

    // Get meeting
    registry.register(
      {
        name: 'get_meeting',
        description: 'Get details of a specific meeting by ID',
        inputSchema: {
          type: 'object',
          properties: {
            meetingId: { type: 'string', description: 'The unique ID of the meeting' },
            ...orgIdProperty,
          },
          required: ['meetingId'],
        },
      },
      async (params) => instance.getMeeting(params)
    );

    // Archive meeting
    registry.register(
      {
        name: 'archive_meeting',
        description: 'Archive a meeting, making it inaccessible for future use',
        inputSchema: {
          type: 'object',
          properties: {
            meetingId: { type: 'string', description: 'The unique ID of the meeting to archive' },
            ...orgIdProperty,
          },
          required: ['meetingId'],
        },
      },
      async (params) => instance.archiveMeeting(params)
    );

    // Get meeting session info
    registry.register(
      {
        name: 'get_meeting_session_info',
        description: 'Get session information of a meeting, including participant tokens to connect. Tokens are generated when meeting status becomes MEETING_STATUS_AVAILABLE.',
        inputSchema: {
          type: 'object',
          properties: {
            meetingId: { type: 'string', description: 'The unique ID of the meeting' },
            ...orgIdProperty,
          },
          required: ['meetingId'],
        },
      },
      async (params) => instance.getMeetingSessionInfo(params)
    );
  }

  async createMeeting(params: any) {
    try {
      const { orgId, ...createData } = params;
      const result = await this.client.createMeeting(createData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMeeting(params: any) {
    try {
      const result = await this.client.getMeeting(params.meetingId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMeetingSessionInfo(params: any) {
    try {
      const result = await this.client.getMeetingSessionInfo(params.meetingId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async archiveMeeting(params: any) {
    try {
      const result = await this.client.archiveMeeting(params.meetingId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
