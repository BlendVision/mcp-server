import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Chatroom Tools
 * Handles chatroom and messaging operations
 */
export class ChatroomTools extends BaseTool {
  static registerTools(registry: ToolRegistry, instance: ChatroomTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    registry.register(
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
      async (params) => instance.listChatrooms(params)
    );

    registry.register(
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
      async (params) => instance.getChatroom(params)
    );

    registry.register(
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
      async (params) => instance.createChatroom(params)
    );

    registry.register(
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
      async (params) => instance.sendMessage(params)
    );
  }

  async listChatrooms(params: any) {
    try {
      const result = await this.client.listChatrooms(params);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getChatroom(params: any) {
    try {
      const result = await this.client.getChatroom(params.chatroomId, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createChatroom(params: any) {
    try {
      const { orgId, ...createData } = params;
      const result = await this.client.createChatroom(createData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendMessage(params: any) {
    try {
      const { chatroomId, orgId, ...messageData } = params;
      const result = await this.client.sendMessage(chatroomId, messageData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
