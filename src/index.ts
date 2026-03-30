#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BlendVisionClient } from './client.js';
import type { BlendVisionConfig } from './types.js';

// Import all tool modules
import {
  ToolRegistry,
  VODTools,
  LiveTools,
  AnalyticsTools,
  ChatroomTools,
  AccountTools,
  ClipsTools,
} from './tools/index.js';

// Environment configuration
const config: BlendVisionConfig = {
  apiToken: process.env.BLENDVISION_API_TOKEN || '',
  organizationId: process.env.BLENDVISION_ORG_ID,  // Optional - can be provided per-request
  baseUrl: process.env.BLENDVISION_BASE_URL,
};

if (!config.apiToken) {
  throw new Error('BLENDVISION_API_TOKEN environment variable is required');
}

// Initialize client and registry
const client = new BlendVisionClient(config);
const registry = new ToolRegistry();

// Initialize and register all tool modules
const vodTools = new VODTools(client);
const liveTools = new LiveTools(client);
const analyticsTools = new AnalyticsTools(client);
const chatroomTools = new ChatroomTools(client);
const accountTools = new AccountTools(client);
const clipsTools = new ClipsTools(client);

// Register all tools
VODTools.registerTools(registry, vodTools);
LiveTools.registerTools(registry, liveTools);
AnalyticsTools.registerTools(registry, analyticsTools);
ChatroomTools.registerTools(registry, chatroomTools);
AccountTools.registerTools(registry, accountTools);
ClipsTools.registerTools(registry, clipsTools);

// Create MCP server
const server = new Server(
  {
    name: 'blendvision-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: registry.getAllTools() };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = args as Record<string, any>;

  try {
    // Get handler from registry
    const handler = registry.getHandler(name);

    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Execute the handler
    const result = await handler(params);
    return result;
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BlendVision MCP Server running on stdio');
  console.error(`Registered ${registry.getToolCount()} tools`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
