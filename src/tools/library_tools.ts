import axios from 'axios';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';
import { BlendVisionClient } from '../client.js';

/**
 * Mirrors orbit's CMS validation (pkg/service/bv/bop/cms/util.go) so a bad
 * request fails here instead of after a round trip. The server is the
 * authority; this is only a fast path.
 */
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  FILE_TYPE_VIDEO: ['.mp4', '.mpg', '.mov', '.mkv', '.avi', '.m2ts', '.ts', '.wmv', '.m4v', '.mxf'],
  FILE_TYPE_IMAGE: ['.jpg', '.jpeg', '.png', '.ico', '.svg'],
  FILE_TYPE_SUBTITLE: ['.srt', '.vtt'],
  FILE_TYPE_DOCUMENT: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.csv', '.xlsx'],
  FILE_TYPE_AUDIO: ['.mp4', '.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4v', '.mxf'],
};

const KB = 1024;
const MAX_FILE_SIZE: Record<string, number> = {
  FILE_TYPE_VIDEO: 70 * KB * KB * KB,
  FILE_TYPE_IMAGE: 5 * KB * KB,
  FILE_TYPE_SUBTITLE: 3 * KB * KB,
  FILE_TYPE_DOCUMENT: 5 * KB * KB * KB,
  FILE_TYPE_AUDIO: 70 * KB * KB * KB,
};

const MAX_FILE_NAME_LENGTH = 300;

// Extension -> content-type, sent as file.attrs['content-type']. Orbit passes it
// to S3 CreateMultipartUpload as the stored object's Content-Type.
const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mpg': 'video/mpeg',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.wmv': 'video/x-ms-wmv',
  '.m4v': 'video/x-m4v',
  '.mxf': 'application/mxf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Order matters: .mp4 / .m4v / .mxf are legal for both video and audio, and a
// caller who did not say otherwise means video.
const TYPE_INFERENCE_ORDER = [
  'FILE_TYPE_VIDEO',
  'FILE_TYPE_IMAGE',
  'FILE_TYPE_SUBTITLE',
  'FILE_TYPE_DOCUMENT',
  'FILE_TYPE_AUDIO',
];

interface ByteSource {
  name: string;
  size: number;
  /** Yields the bytes for [start, end] inclusive, as a fresh stream each call. */
  open(start: number, end: number): Promise<NodeJS.ReadableStream>;
}

export interface LibraryToolsOptions {
  /**
   * Whether `filePath` is accepted. False for the remote connector, which runs
   * on a server and has no access to the caller's filesystem.
   */
  allowLocalFile?: boolean;
}

/**
 * Library File Tools
 * Handles file upload and management operations
 */
export class LibraryTools extends BaseTool {
  private allowLocalFile: boolean;

  constructor(client: BlendVisionClient, options: LibraryToolsOptions = {}) {
    super(client);
    this.allowLocalFile = options.allowLocalFile ?? true;
  }

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
        description:
          'Upload a file to the BlendVision library. Give filePath (a local file) or sourceUrl ' +
          '(a URL this process can fetch) and the whole upload runs here: the session is opened, ' +
          'the bytes are PUT to the presigned URL(s), and the upload is completed -- the returned ' +
          'file.id is what create_video takes as source.library.video.id. ' +
          'Given neither, it only opens the session and returns the presigned URLs, and you must ' +
          'PUT the parts yourself and finish with complete_file_upload.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description:
                'Absolute path of a local file to upload. Runs the whole upload. ' +
                'Mutually exclusive with sourceUrl. Not available on the remote connector.'
            },
            sourceUrl: {
              type: 'string',
              description:
                'URL to stream the file from; must answer a HEAD request with Content-Length. ' +
                'Runs the whole upload. Mutually exclusive with filePath.'
            },
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
              description: 'File type. Inferred from the extension when filePath/sourceUrl is used.'
            },
            name: {
              type: 'string',
              description: 'Filename. Defaults to the basename of filePath / sourceUrl.'
            },
            size: {
              type: 'number',
              description: 'File size in bytes. Read from the file when filePath/sourceUrl is used.'
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
          // `source` defaults to FILE_SOURCE_UPLOAD_IN_LIBRARY, so a one-shot
          // upload needs nothing but filePath / sourceUrl.
          required: [],
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
      // No bytes to push: keep the original behaviour of just opening the
      // session and handing back the presigned URLs.
      if (!params.filePath && !params.sourceUrl) {
        const { orgId, ...fileData } = params;
        const result = await this.client.uploadFile(fileData, orgId);
        return this.formatResponse(result);
      }

      return await this.uploadFileInOneShot(params);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Runs all three steps of One's upload: open the session, PUT the bytes to
   * the presigned URL(s), complete with each part's ETag. An agent cannot PUT
   * binary itself, so without this the session-opening call dead-ends.
   */
  private async uploadFileInOneShot(params: any) {
    const source = await this.resolveSource(params);
    const fileType = this.resolveFileType(source.name, params.type);

    this.validateSource(source, fileType);

    const contentType = CONTENT_TYPES[extname(source.name).toLowerCase()];
    const attrs = { ...(contentType ? { 'content-type': contentType } : {}), ...(params.attrs || {}) };

    // client.uploadFile wraps this in `{ file: ... }` itself.
    const started: any = this.unwrap(
      await this.client.uploadFile(
        {
          name: source.name,
          size: String(source.size),
          type: fileType,
          source: params.source || 'FILE_SOURCE_UPLOAD_IN_LIBRARY',
          ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
          ...(params.metadata ? { metadata: params.metadata } : {}),
        },
        params.orgId
      )
    );

    const fileId: string = started?.file?.id;
    const uploadId: string = started?.upload_data?.id;
    const uploadParts: Array<{ part_number?: number; presigned_url: string }> =
      started?.upload_data?.parts || [];

    if (!fileId || !uploadId || uploadParts.length === 0) {
      throw new Error(`unexpected upload response: ${JSON.stringify(started)}`);
    }

    let parts;
    try {
      parts = await this.putParts(source, uploadParts);
    } catch (error) {
      // Leave no dangling multipart upload behind. Best effort: the content
      // bucket aborts incomplete uploads after a day anyway.
      await this.client.cancelUploadFile(fileId, uploadId, params.orgId).catch(() => undefined);
      throw error;
    }

    // client.completeUploadFile wraps this in `{ complete_data: ... }` itself.
    const completed: any = this.unwrap(
      await this.client.completeUploadFile(fileId, { id: uploadId, parts }, params.orgId)
    );

    return this.formatResponse({
      data: {
        ...completed,
        uploaded_parts: parts.length,
        uploaded_bytes: source.size,
      },
    });
  }

  /** Turns a client ApiResponse into data, or throws with the server's message. */
  private unwrap<T>(result: { data?: T; error?: any }): T {
    if (result.error) {
      throw new Error(
        `${result.error.code || 'ERROR'}: ${result.error.message || JSON.stringify(result.error)}`
      );
    }

    return result.data as T;
  }

  private async resolveSource(params: any): Promise<ByteSource> {
    const { filePath, sourceUrl } = params;

    if (filePath && sourceUrl) {
      throw new Error('filePath and sourceUrl are mutually exclusive');
    }

    if (filePath) {
      if (!this.allowLocalFile) {
        throw new Error(
          'filePath is not available on the remote connector (it cannot read your filesystem); use sourceUrl'
        );
      }

      const info = await stat(filePath);
      if (!info.isFile()) {
        throw new Error(`not a file: ${filePath}`);
      }

      return {
        name: params.name || basename(filePath),
        size: info.size,
        async open(start, end) {
          return createReadStream(filePath, { start, end });
        },
      };
    }

    const head = await axios.head(sourceUrl);
    const size = Number(head.headers['content-length']);

    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(
        `sourceUrl did not report a usable Content-Length: ${head.headers['content-length']}`
      );
    }

    const total = size;

    return {
      name: params.name || basename(new URL(sourceUrl).pathname) || 'upload',
      size,
      async open(start, end) {
        const ranged = !(start === 0 && end === total - 1);
        const response = await axios.get(sourceUrl, {
          responseType: 'stream',
          ...(ranged ? { headers: { Range: `bytes=${start}-${end}` } } : {}),
        });

        return response.data as NodeJS.ReadableStream;
      },
    };
  }

  private resolveFileType(fileName: string, requested?: string): string {
    if (requested) {
      const normalized = requested.toUpperCase();
      if (!ALLOWED_EXTENSIONS[normalized]) {
        throw new Error(`fileType ${requested} cannot be uploaded this way`);
      }

      return normalized;
    }

    const ext = extname(fileName).toLowerCase();
    const inferred = TYPE_INFERENCE_ORDER.find((t) => ALLOWED_EXTENSIONS[t].includes(ext));

    if (!inferred) {
      throw new Error(`cannot infer file type from extension "${ext}"; pass type explicitly`);
    }

    return inferred;
  }

  private validateSource(source: ByteSource, fileType: string): void {
    if (!source.name) {
      throw new Error('file name is empty');
    }

    if (source.name.length > MAX_FILE_NAME_LENGTH) {
      throw new Error(`file name must be at most ${MAX_FILE_NAME_LENGTH} characters`);
    }

    const ext = extname(source.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS[fileType].includes(ext)) {
      throw new Error(
        `extension "${ext}" is not allowed for ${fileType} (allowed: ${ALLOWED_EXTENSIONS[fileType].join(', ')})`
      );
    }

    if (source.size <= 0 || source.size > MAX_FILE_SIZE[fileType]) {
      throw new Error(
        `file size ${source.size} is out of range for ${fileType} (max ${MAX_FILE_SIZE[fileType]} bytes)`
      );
    }
  }

  /**
   * PUTs every part and collects its ETag.
   *
   * The server picks the part count from the declared size (one part per
   * `--upload-part-size-mb`, 500MB by default), so the slice width is derived
   * from the count rather than hardcoded -- that keeps working if the server is
   * reconfigured.
   */
  private async putParts(
    source: ByteSource,
    uploadParts: Array<{ part_number?: number; presigned_url: string }>
  ): Promise<Array<{ part_number: number; etag: string }>> {
    const partSize = Math.ceil(source.size / uploadParts.length);
    const parts: Array<{ part_number: number; etag: string }> = [];

    for (let i = 0; i < uploadParts.length; i++) {
      const partNumber = uploadParts[i].part_number ?? i + 1;
      const start = i * partSize;
      const end = Math.min(start + partSize, source.size) - 1;
      const length = end - start + 1;

      const etag = await this.retry(async () => {
        // A bare axios call on purpose: the presigned URL carries its own SigV4
        // query signature, and S3 rejects a request that also sends an
        // Authorization header ("Only one auth mechanism allowed").
        const body = await source.open(start, end);
        const response = await axios.put(uploadParts[i].presigned_url, body, {
          headers: {
            'Content-Length': String(length),
            'Content-Type': 'application/octet-stream',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        const value = response.headers['etag'];
        if (!value) {
          throw new Error(`part ${partNumber} upload returned no ETag`);
        }

        return value as string;
      });

      console.error(`[upload_file] part ${partNumber}/${uploadParts.length} done (${length} bytes)`);
      parts.push({ part_number: partNumber, etag });
    }

    return parts;
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
