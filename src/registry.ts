import { BlendVisionClient } from './client.js';
import type { BlendVisionConfig } from './types.js';

import {
  ToolRegistry,
  VODTools,
  LiveTools,
  AnalyticsTools,
  ChatroomTools,
  AccountTools,
  ClipsTools,
  LibraryTools,
  MeetingTools,
} from './tools/index.js';

/**
 * Build a fully-populated tool registry and client from config.
 * Shared by the MCP server (index.ts) and the CLI (cli.ts) so that
 * the tool set stays in sync no matter how it is invoked.
 */
export function buildRegistry(config: BlendVisionConfig): {
  client: BlendVisionClient;
  registry: ToolRegistry;
} {
  const client = new BlendVisionClient(config);
  const registry = new ToolRegistry();

  const modules = [
    [VODTools, new VODTools(client)],
    [LiveTools, new LiveTools(client)],
    [AnalyticsTools, new AnalyticsTools(client)],
    [ChatroomTools, new ChatroomTools(client)],
    [AccountTools, new AccountTools(client)],
    [ClipsTools, new ClipsTools(client)],
    [LibraryTools, new LibraryTools(client)],
    [MeetingTools, new MeetingTools(client)],
  ] as const;

  for (const [Klass, instance] of modules) {
    (Klass as any).registerTools(registry, instance);
  }

  return { client, registry };
}

/**
 * Read BlendVision config from environment variables.
 */
export function configFromEnv(): BlendVisionConfig {
  return {
    apiToken: process.env.BLENDVISION_API_TOKEN || '',
    organizationId: process.env.BLENDVISION_ORG_ID,
    baseUrl: process.env.BLENDVISION_BASE_URL,
  };
}
