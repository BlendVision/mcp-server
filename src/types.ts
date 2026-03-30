export interface BlendVisionConfig {
  apiToken: string;
  organizationId?: string;  // Optional - can be provided per-request
  baseUrl?: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// VOD Types
export interface Video {
  id: string;
  title: string;
  description?: string;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  duration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVideoRequest {
  title: string;
  description?: string;
  resourceId?: string;
}

// Live Types
export interface LiveChannel {
  id: string;
  name: string;
  status: 'IDLE' | 'PREVIEW' | 'READY' | 'STREAMING' | 'ENDED';
  streamKey?: string;
  ingestUrl?: string;
  createdAt: string;
}

export interface CreateLiveChannelRequest {
  name: string;
  description?: string;
  profileId?: string;
}

// Chatroom Types
export interface Chatroom {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface SendMessageRequest {
  chatroomId: string;
  message: string;
  userId?: string;
}

// Account Types
export interface Account {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

// Playback Types
export interface PlaybackToken {
  token: string;
  expiresAt: string;
}

export interface GeneratePlaybackTokenRequest {
  resourceId: string;
  resourceType: 'VOD' | 'LIVE';
  deviceId?: string;
  expiration?: number;
}
