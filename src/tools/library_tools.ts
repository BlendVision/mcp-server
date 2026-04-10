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
}
