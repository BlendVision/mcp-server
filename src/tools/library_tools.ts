import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Library File Tools
 * Handles file upload and management operations
 */
export class LibraryTools extends BaseTool {
  /**
   * Register all Library file tools to the registry
   */
  static registerTools(registry: ToolRegistry, instance: LibraryTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    // Upload file
    registry.register(
      {
        name: 'upload_file',
        description: 'Initiate a file upload to BlendVision library. Returns upload session data with presigned URLs for uploading file parts.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'FILE_TYPE_VIDEO',
                'FILE_TYPE_IMAGE',
                'FILE_TYPE_SUBTITLE',
                'FILE_TYPE_DOCUMENT',
                'FILE_TYPE_WEB_LINK',
                'FILE_TYPE_AUDIO'
              ],
              description: 'File type'
            },
            name: {
              type: 'string',
              description: 'Filename'
            },
            size: {
              type: 'number',
              description: 'File size in bytes'
            },
            source: {
              type: 'string',
              enum: [
                'FILE_SOURCE_UPLOAD_IN_LIBRARY',
                'FILE_SOURCE_CLOUD_STORAGE_AWS',
                'FILE_SOURCE_CLOUD_STORAGE_GCP',
                'FILE_SOURCE_CLOUD_STORAGE_AZURE'
              ],
              description: 'File source (required)',
              default: 'FILE_SOURCE_UPLOAD_IN_LIBRARY'
            },
            attrs: {
              type: 'object',
              description: 'Custom attributes as key-value pairs'
            },
            metadata: {
              type: 'object',
              description: 'File metadata',
              properties: {
                short_description: { type: 'string' },
                long_description: { type: 'string' },
                labels: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            ...orgIdProperty,
          },
          required: ['source'],
        },
      },
      async (params) => instance.uploadFile(params)
    );

    // Complete file upload
    registry.register(
      {
        name: 'complete_file_upload',
        description: 'Complete a file upload session after uploading all parts. This finalizes the upload process.',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'The file ID returned from upload_file'
            },
            uploadId: {
              type: 'string',
              description: 'The upload session ID from upload_data.id in upload_file response'
            },
            parts: {
              type: 'array',
              description: 'Array of uploaded parts with their ETags',
              items: {
                type: 'object',
                properties: {
                  part_number: {
                    type: 'number',
                    description: 'Sequential part number'
                  },
                  etag: {
                    type: 'string',
                    description: 'ETag value from presigned URL upload response'
                  }
                },
                required: ['part_number', 'etag']
              }
            },
            checksum_sha1: {
              type: 'string',
              description: 'Base64-encoded SHA-1 digest (deprecated but optional)'
            },
            ...orgIdProperty,
          },
          required: ['fileId', 'uploadId', 'parts'],
        },
      },
      async (params) => instance.completeUploadFile(params)
    );

    // Update file
    registry.register(
      {
        name: 'update_file',
        description: 'Update the details of an existing file in BlendVision library.',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'The file ID to update'
            },
            name: {
              type: 'string',
              description: 'New filename'
            },
            metadata: {
              type: 'object',
              description: 'File metadata',
              properties: {
                short_description: { type: 'string' },
                long_description: { type: 'string' },
                labels: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            attrs: {
              type: 'object',
              description: 'Custom attributes as key-value pairs'
            },
            ...orgIdProperty,
          },
          required: ['fileId'],
        },
      },
      async (params) => instance.updateFile(params)
    );

    // Cancel file upload
    registry.register(
      {
        name: 'cancel_file_upload',
        description: 'Cancel (terminate) an in-progress file upload session.',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'The file ID to cancel upload for'
            },
            uploadId: {
              type: 'string',
              description: 'The upload session ID to terminate'
            },
            ...orgIdProperty,
          },
          required: ['fileId', 'uploadId'],
        },
      },
      async (params) => instance.cancelUploadFile(params)
    );

    // Get file
    registry.register(
      {
        name: 'get_file',
        description: 'Get details of a specific file in BlendVision library by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'The file ID'
            },
            ...orgIdProperty,
          },
          required: ['fileId'],
        },
      },
      async (params) => instance.getFile(params)
    );

    // Delete file
    registry.register(
      {
        name: 'delete_file',
        description: 'Delete a file from BlendVision library.',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'The file ID to delete'
            },
            ...orgIdProperty,
          },
          required: ['fileId'],
        },
      },
      async (params) => instance.deleteFile(params)
    );

    // Download file
    registry.register(
      {
        name: 'download_file',
        description: 'Get a download link and its expiration time for a specified file in BlendVision library.',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'The file ID to download'
            },
            ...orgIdProperty,
          },
          required: ['fileId'],
        },
      },
      async (params) => instance.downloadFile(params)
    );
  }

  async uploadFile(params: any) {
    try {
      const { orgId, ...fileData } = params;
      const result = await this.client.uploadFile(fileData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async completeUploadFile(params: any) {
    try {
      const { fileId, uploadId, parts, checksum_sha1, orgId } = params;
      const completeData: any = {
        id: uploadId,
        parts: parts
      };

      if (checksum_sha1) {
        completeData.checksum_sha1 = checksum_sha1;
      }

      const result = await this.client.completeUploadFile(fileId, completeData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateFile(params: any) {
    try {
      const { fileId, orgId, ...updateData } = params;
      const result = await this.client.updateFile(fileId, updateData, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelUploadFile(params: any) {
    try {
      const { fileId, uploadId, orgId } = params;
      const result = await this.client.cancelUploadFile(fileId, uploadId, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFile(params: any) {
    try {
      const { fileId, orgId } = params;
      const result = await this.client.getFile(fileId, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteFile(params: any) {
    try {
      const { fileId, orgId } = params;
      const result = await this.client.deleteFile(fileId, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async downloadFile(params: any) {
    try {
      const { fileId, orgId } = params;
      const result = await this.client.downloadFile(fileId, orgId);
      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
