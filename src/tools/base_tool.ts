import { BlendVisionClient } from '../client.js';

/**
 * Base class for all MCP tools
 * Provides common functionality like retry logic, pagination, and error handling
 */
export abstract class BaseTool {
  protected client: BlendVisionClient;

  constructor(client: BlendVisionClient) {
    this.client = client;
  }

  /**
   * Retry a function with exponential backoff
   * @param fn Function to retry
   * @param maxRetries Maximum number of retries (default: 3)
   * @param delayMs Initial delay in milliseconds (default: 200)
   */
  protected async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 200
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const waitTime = delayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Fetch all pages from a paginated endpoint
   * @param fetchPage Function that fetches a single page
   * @param maxPages Maximum number of pages to fetch (default: 50)
   */
  protected async fetchAllPages<T>(
    fetchPage: (page: number, pageSize: number) => Promise<{ data: T[]; hasMore: boolean }>,
    maxPages: number = 50
  ): Promise<T[]> {
    const results: T[] = [];
    const pageSize = 50;

    for (let page = 1; page <= maxPages; page++) {
      const response = await fetchPage(page, pageSize);
      results.push(...response.data);

      if (!response.hasMore) {
        break;
      }
    }

    return results;
  }

  /**
   * Handle API response and format errors
   */
  protected formatResponse<T>(result: { data?: T; error?: any }) {
    if (result.error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: result.error,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  /**
   * Handle errors and return formatted error response
   */
  protected handleError(error: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
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
}
