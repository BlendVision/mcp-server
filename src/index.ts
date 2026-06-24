#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { buildRegistry, configFromEnv } from './registry.js';

// Environment configuration
const config = configFromEnv();

if (!config.apiToken) {
  throw new Error('BLENDVISION_API_TOKEN environment variable is required');
}

// Initialize client and registry (shared with the CLI)
const { registry } = buildRegistry(config);

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
