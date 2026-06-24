import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Analytics Tools
 * Handles analytics and reporting operations
 */
export class AnalyticsTools extends BaseTool {
  static registerTools(registry: ToolRegistry, instance: AnalyticsTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    registry.register(
      {
        name: 'get_analytics',
        description: 'Get analytics reports with various metrics',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'Start date in ISO format' },
            endDate: { type: 'string', description: 'End date in ISO format' },
            metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to retrieve' },
            resourceId: { type: 'string', description: 'Filter by specific resource ID' },
            ...orgIdProperty,
          },
        },
      },
      async (params) => instance.getAnalytics(params)
    );

    registry.register(
      {
        name: 'get_cdn_usage_report',
        description: 'Get CDN usage report for bandwidth and traffic analysis',
        inputSchema: {
          type: 'object',
          properties: {
            time: {
              type: 'string',
              description: 'Time in date-time format (e.g., 2024-01-01T00:00:00Z)',
              format: 'date-time',
            },
            streamingType: {
              type: 'string',
              description: 'Streaming type for the report',
              enum: ['CDN_REPORT_STREAMING_TYPE_LIVE', 'CDN_REPORT_STREAMING_TYPE_VOD', 'CDN_REPORT_STREAMING_TYPE_LIVE_TO_VOD'],
            },
            ...orgIdProperty,
          },
          required: ['time', 'streamingType'],
        },
      },
      async (params) => instance.getCdnUsageReport(params)
    );

    registry.register(
      {
        name: 'query_default_usage_charts',
        description: 'Query default usage charts with time range and filters',
        inputSchema: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO format (e.g., 2026-02-19T16:00:00.000Z)',
              format: 'date-time',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO format (e.g., 2026-03-19T16:00:00.000Z)',
              format: 'date-time',
            },
            analyticsStreamingType: {
              type: 'string',
              description: 'Analytics streaming type',
              enum: ['STREAMING_TYPE_UNSPECIFIED', 'STREAMING_TYPE_LIVE', 'STREAMING_TYPE_VOD', 'STREAMING_TYPE_LIVE_TO_VOD'],
            },
            businessOrgIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of business organization IDs',
            },
            timeGranularity: {
              type: 'string',
              description: 'Time granularity for the report',
              enum: ['TIME_GRANULARITY_UNSPECIFIED', 'TIME_GRANULARITY_DAY', 'TIME_GRANULARITY_HOUR', 'TIME_GRANULARITY_MONTH'],
            },
            usageType: {
              type: 'string',
              description: 'Usage type',
              enum: ['USAGE_TYPE_UNSPECIFIED', 'USAGE_TYPE_CDN', 'USAGE_TYPE_TRANSCODING'],
            },
            ...orgIdProperty,
          },
          required: ['startTime', 'endTime'],
        },
      },
      async (params) => instance.queryDefaultUsageCharts(params)
    );

    registry.register(
      {
        name: 'get_user_access_chart',
        description: 'Get user access analytics chart with viewer and visit counts',
        inputSchema: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO format (e.g., 2026-02-20T16:00:00.000Z)',
              format: 'date-time',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO format (e.g., 2026-03-20T16:00:00.000Z)',
              format: 'date-time',
            },
            timeGranularity: {
              type: 'string',
              description: 'Time granularity for the report',
              enum: ['TIME_GRANULARITY_UNSPECIFIED', 'TIME_GRANULARITY_DAY', 'TIME_GRANULARITY_HOUR', 'TIME_GRANULARITY_MONTH'],
            },
            businessOrgIds: {
              type: 'string',
              description: 'Business organization ID (comma-separated if multiple)',
            },
            ...orgIdProperty,
          },
          required: ['startTime', 'endTime'],
        },
      },
      async (params) => instance.getUserAccessChart(params)
    );

    registry.register(
      {
        name: 'query_usage_summary',
        description: 'Query usage summary analytics including CDN, encoding, storage, and streaming metrics',
        inputSchema: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO format (e.g., 2026-02-25T00:00:00.000Z)',
              format: 'date-time',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO format (e.g., 2026-03-25T00:00:00.000Z)',
              format: 'date-time',
            },
            analyticsStreamingType: {
              type: 'string',
              description: 'Analytics streaming type',
              enum: ['STREAMING_TYPE_UNSPECIFIED', 'STREAMING_TYPE_LIVE', 'STREAMING_TYPE_VOD', 'STREAMING_TYPE_LIVE_TO_VOD'],
            },
            businessOrgIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of business organization IDs',
            },
            ...orgIdProperty,
          },
          required: ['startTime', 'endTime'],
        },
      },
      async (params) => instance.queryUsageSummary(params)
    );

    registry.register(
      {
        name: 'query_aisk_usage_summary',
        description: 'Query AI Search Kit (AISK) usage summary including STT hours, AI insight hours, AI quiz requests, embedding/stored character counts, storage, and multimodal metrics',
        inputSchema: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO format (e.g., 2026-05-27T16:00:00.000Z)',
              format: 'date-time',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO format (e.g., 2026-06-24T16:00:00.000Z)',
              format: 'date-time',
            },
            businessOrgIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of business organization IDs (required)',
            },
            botIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of bot IDs to filter by (optional)',
            },
            ...orgIdProperty,
          },
          required: ['startTime', 'endTime', 'businessOrgIds'],
        },
      },
      async (params) => instance.queryAiskUsageSummary(params)
    );

    registry.register(
      {
        name: 'query_aisk_usage_charts',
        description: 'Query AI Search Kit (AISK) usage charts over time with breakdown dimension and usage type filters',
        inputSchema: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO format (e.g., 2026-05-27T16:00:00.000Z)',
              format: 'date-time',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO format (e.g., 2026-06-24T16:00:00.000Z)',
              format: 'date-time',
            },
            businessOrgIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of business organization IDs (required)',
            },
            timeGranularity: {
              type: 'string',
              description: 'Time granularity for the report (required)',
              enum: [
                'TIME_GRANULARITY_UNSPECIFIED',
                'TIME_GRANULARITY_HOUR',
                'TIME_GRANULARITY_DAY',
                'TIME_GRANULARITY_MONTH',
                'TIME_GRANULARITY_YEAR',
                'TIME_GRANULARITY_QUARTER',
              ],
            },
            usageType: {
              type: 'string',
              description: 'AISK usage type (required)',
              enum: [
                'AISK_USAGE_TYPE_UNSPECIFIED',
                'AISK_USAGE_TYPE_MESSAGE',
                'AISK_USAGE_TYPE_BOT',
                'AISK_USAGE_TYPE_SOURCE_CHARACTERS',
                'AISK_USAGE_TYPE_STORAGE',
                'AISK_USAGE_TYPE_AUTO_GEN_TRANSCRIPTION',
                'AISK_USAGE_TYPE_STORED_CHARACTERS',
                'AISK_USAGE_TYPE_AI_INSIGHT',
                'AISK_USAGE_TYPE_AI_QUIZ',
                'AISK_USAGE_TYPE_MULTIMODAL_VIDEO_ANALYSIS',
                'AISK_USAGE_TYPE_MULTIMODAL_FACE_IMAGE',
                'AISK_USAGE_TYPE_MULTIMODAL_FACE_RECOGNITION',
                'AISK_USAGE_TYPE_MULTIMODAL_SEARCH',
              ],
            },
            botIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of bot IDs to filter by (optional)',
            },
            breakdownDimension: {
              type: 'string',
              description: 'Breakdown dimension for the chart (only used with usage_type AISK_USAGE_TYPE_MESSAGE)',
              enum: ['BREAKDOWN_DIMENSION_UNSPECIFIED', 'BREAKDOWN_DIMENSION_BOT', 'BREAKDOWN_DIMENSION_MODEL'],
            },
            ...orgIdProperty,
          },
          required: ['startTime', 'endTime', 'businessOrgIds', 'timeGranularity', 'usageType'],
        },
      },
      async (params) => instance.queryAiskUsageCharts(params)
    );
  }

  async getAnalytics(params: any) {
    try {
      const { orgId, ...analyticsParams } = params;
      const result = await this.client.getAnalytics(analyticsParams, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCdnUsageReport(params: any) {
    try {
      const cdnParams = {
        time: params.time,
        streaming_type: params.streamingType,
      };
      const result = await this.client.getCdnUsageReport(cdnParams, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async queryDefaultUsageCharts(params: any) {
    try {
      const usageChartsData = {
        start_time: params.startTime,
        end_time: params.endTime,
        ...(params.analyticsStreamingType && { analytics_streaming_type: params.analyticsStreamingType }),
        ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
        ...(params.timeGranularity && { time_granularity: params.timeGranularity }),
        ...(params.usageType && { usage_type: params.usageType }),
      };
      const result = await this.client.queryDefaultUsageCharts(usageChartsData, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getUserAccessChart(params: any) {
    try {
      const userAccessParams = {
        start_time: params.startTime,
        end_time: params.endTime,
        ...(params.timeGranularity && { time_granularity: params.timeGranularity }),
        ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
      };
      const result = await this.client.getUserAccessChart(userAccessParams, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async queryUsageSummary(params: any) {
    try {
      const usageSummaryData = {
        start_time: params.startTime,
        end_time: params.endTime,
        ...(params.analyticsStreamingType && { analytics_streaming_type: params.analyticsStreamingType }),
        ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
      };
      const result = await this.client.queryUsageSummary(usageSummaryData, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async queryAiskUsageSummary(params: any) {
    try {
      const data = {
        start_time: params.startTime,
        end_time: params.endTime,
        ...(params.botIds && { bot_ids: params.botIds }),
        ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
      };
      const result = await this.client.queryAiskUsageSummary(data, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async queryAiskUsageCharts(params: any) {
    try {
      const data = {
        start_time: params.startTime,
        end_time: params.endTime,
        ...(params.botIds && { bot_ids: params.botIds }),
        ...(params.breakdownDimension && { breakdown_dimension: params.breakdownDimension }),
        ...(params.businessOrgIds && { business_org_ids: params.businessOrgIds }),
        ...(params.timeGranularity && { time_granularity: params.timeGranularity }),
        ...(params.usageType && { usage_type: params.usageType }),
      };
      const result = await this.client.queryAiskUsageCharts(data, params.orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
