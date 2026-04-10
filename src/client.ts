import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { BlendVisionConfig, ApiResponse } from './types.js';

export class BlendVisionClient {
  private client: AxiosInstance;
  private config: BlendVisionConfig;

  constructor(config: BlendVisionConfig) {
    this.config = config;
    const baseUrl = config.baseUrl || 'https://api.one.blendvision.com';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiToken}`,
    };

    // Only add x-bv-org-id if organizationId is provided in config
    if (config.organizationId) {
      headers['x-bv-org-id'] = config.organizationId;
    }

    this.client = axios.create({
      baseURL: baseUrl,
      headers,
    });
  }

  async request<T = any>(
    method: string,
    path: string,
    data?: any,
    config?: AxiosRequestConfig & { orgId?: string }
  ): Promise<ApiResponse<T>> {
    try {
      // Use custom org_id if provided, otherwise use default from config
      const orgId = config?.orgId || this.config.organizationId;
      const { orgId: _, ...axiosConfig } = config || {};

      const headers: Record<string, string> = {};

      // Only add x-bv-org-id header if orgId is available
      if (orgId) {
        headers['x-bv-org-id'] = orgId;
      }

      const response = await this.client.request<T>({
        method,
        url: path,
        data,
        headers,
        ...axiosConfig,
      });

      return { data: response.data };
    } catch (error: any) {
      return {
        error: {
          code: error.response?.data?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.message || error.message,
          details: error.response?.data,
        },
      };
    }
  }

  // VOD API Methods
  async listVideos(params?: { page?: number; pageSize?: number; status?: string; orgId?: string }) {
    const { orgId, ...queryParams } = params || {};
    return this.request('GET', '/bv/cms/v1/vods', undefined, { params: queryParams, orgId });
  }

  async getVideo(videoId: string, orgId?: string) {
    return this.request('GET', `/bv/cms/v1/vods/${videoId}`, undefined, { orgId });
  }

  async createVideo(data: any, orgId?: string) {
    return this.request('POST', '/bv/cms/v1/vods', data, { orgId });
  }

  async updateVideo(videoId: string, data: any, orgId?: string) {
    return this.request('PATCH', `/bv/cms/v1/vods/${videoId}`, data, { orgId });
  }

  async deleteVideo(videoId: string, orgId?: string) {
    return this.request('DELETE', `/bv/cms/v1/vods/${videoId}`, undefined, { orgId });
  }

  async updateVodSubtitles(videoId: string, data: any, orgId?: string) {
    return this.request('PUT', `/bv/cms/v1/vods/${videoId}/subtitles`, data, { orgId });
  }

  // Live API Methods
  async listLiveChannels(params?: { page?: number; pageSize?: number; orgId?: string }) {
    const { orgId, ...queryParams } = params || {};
    return this.request('GET', '/bv/cms/v1/lives', undefined, { params: queryParams, orgId });
  }

  async getLiveChannel(channelId: string, orgId?: string) {
    return this.request('GET', `/bv/cms/v1/lives/${channelId}`, undefined, { orgId });
  }

  async createLiveChannel(data: any, orgId?: string) {
    // Wrap the data in a 'live' object as required by the API
    const requestBody = { live: data };
    return this.request('POST', '/bv/cms/v1/lives', requestBody, { orgId });
  }

  async updateLiveChannel(channelId: string, data: any, orgId?: string) {
    return this.request('PATCH', `/bv/cms/v1/lives/${channelId}`, data, { orgId });
  }

  async deleteLiveChannel(channelId: string, orgId?: string) {
    return this.request('DELETE', `/bv/cms/v1/lives/${channelId}`, undefined, { orgId });
  }

  async startLive(channelId: string, orgId?: string) {
    return this.request('POST', `/bv/cms/v1/lives/${channelId}:start`, undefined, { orgId });
  }

  async stopLive(channelId: string, orgId?: string) {
    return this.request('POST', `/bv/cms/v1/lives/${channelId}:end`, undefined, { orgId });
  }

  async cancelLive(channelId: string, orgId?: string) {
    return this.request('POST', `/bv/cms/v1/lives/${channelId}:cancel`, {}, { orgId });
  }

  async archiveLive(channelId: string, orgId?: string) {
    return this.request('POST', `/bv/cms/v1/lives/${channelId}:archive`, {}, { orgId });
  }

  // Chatroom API Methods
  async listChatrooms(params?: { page?: number; pageSize?: number; orgId?: string }) {
    const { orgId, ...queryParams } = params || {};
    return this.request('GET', '/bv/chatroom/v1/chatrooms', undefined, { params: queryParams, orgId });
  }

  async getChatroom(chatroomId: string, orgId?: string) {
    return this.request('GET', `/bv/chatroom/v1/chatrooms/${chatroomId}`, undefined, { orgId });
  }

  async createChatroom(data: any, orgId?: string) {
    return this.request('POST', '/bv/chatroom/v1/chatrooms', data, { orgId });
  }

  async sendMessage(chatroomId: string, data: any, orgId?: string) {
    return this.request('POST', `/bv/chatroom/v1/chatrooms/${chatroomId}/messages`, data, { orgId });
  }

  // Account API Methods
  async getAccount(orgId?: string) {
    return this.request('GET', '/bv/account/v1/accounts', undefined, { orgId });
  }

  async listOrganizations(orgId?: string) {
    const targetOrgId = orgId || this.config.organizationId;
    return this.request('GET', `/bv/organization/v1/organizations/${targetOrgId}`, undefined, { orgId });
  }

  async listHierarchicalSubOrganizations(orgId?: string) {
    return this.request('GET', `/bv/org/v1/organizations:list-hierarchical-sub-orgs`, undefined, { orgId });
  }

  // Playback API Methods
  async generatePlaybackToken(data: any, orgId?: string) {
    return this.request('POST', '/bv/cms/v1/resource-tokens', data, { orgId });
  }

  async listPlaybackCodes(resourceId: string, orgId?: string) {
    return this.request('GET', `/bv/cms/v1/resources/${resourceId}/codes`, undefined, { orgId });
  }

  // Analytics API Methods
  async getAnalytics(params: any, orgId?: string) {
    return this.request('GET', '/bv/analytics/v1/reports', undefined, { params, orgId });
  }

  async getCdnUsageReport(params: {
    time: string;
    streaming_type: string;
  }, orgId?: string) {
    return this.request('GET', '/bv/analytics/v1/cdn/usage', undefined, { params, orgId });
  }

  async queryDefaultUsageCharts(data: {
    start_time: string;
    end_time: string;
    analytics_streaming_type?: string;
    business_org_ids?: string[];
    time_granularity?: string;
    usage_type?: string;
  }, orgId?: string) {
    return this.request('POST', '/bv/analytics/v1/analytics/default-usage-charts:query', data, { orgId });
  }

  async getUserAccessChart(params: {
    start_time: string;
    end_time: string;
    time_granularity?: string;
    business_org_ids?: string;
  }, orgId?: string) {
    return this.request('GET', '/cxm/storefront/v1alpha1/analytics/user-access:chart', undefined, { params, orgId });
  }

  async queryUsageSummary(data: {
    start_time: string;
    end_time: string;
    analytics_streaming_type?: string;
    business_org_ids?: string[];
  }, orgId?: string) {
    return this.request('POST', '/bv/analytics/v1/analytics/usage-summary:query', data, { orgId });
  }

  // Clips API Methods
  async listClips(params: {
    'source.id': string;
    'source.type': string;
    page?: number;
    pageSize?: number;
    orgId?: string;
  }) {
    const { orgId, ...queryParams } = params;
    return this.request('GET', '/bv/cms/v1/clips', undefined, { params: queryParams, orgId });
  }

  async getClip(clipId: string, orgId?: string) {
    return this.request('GET', `/bv/cms/v1/clips/${clipId}`, undefined, { orgId });
  }

  async createClip(data: any, orgId?: string) {
    return this.request('POST', '/bv/cms/v1/clips', data, { orgId });
  }

  async updateClip(clipId: string, data: any, orgId?: string) {
    return this.request('PATCH', `/bv/cms/v1/clips/${clipId}`, data, { orgId });
  }

  async deleteClip(clipId: string, orgId?: string) {
    return this.request('DELETE', `/bv/cms/v1/clips/${clipId}`, undefined, { orgId });
  }

  // Auto-tagging API Methods
  async getAutoTagging(params: {
    'source.id': string;
    'source.type': string;
    orgId?: string;
  }) {
    const { orgId, ...queryParams } = params;
    return this.request('GET', '/bv/cms/v1/auto-tagging', undefined, { params: queryParams, orgId });
  }

  // Library File API Methods
  async uploadFile(data: any, orgId?: string) {
    // Wrap the data in a 'file' object as required by the API
    const requestBody = { file: data };
    return this.request('POST', '/bv/cms/v1/library/files:upload', requestBody, { orgId });
  }

  async completeUploadFile(fileId: string, completeData: any, orgId?: string) {
    const requestBody = { complete_data: completeData };
    return this.request('POST', `/bv/cms/v1/library/files/${fileId}:complete-upload`, requestBody, { orgId });
  }
}
