# Architecture Overview

This document describes the modular architecture of the BlendVision MCP Server.

## Design Philosophy

The server follows a **modular, layered architecture** inspired by best practices from successful MCP implementations like the [Shopline MCP Server](https://github.com/asgard-ai-platform/mcp-shopline).

### Key Principles

1. **Separation of Concerns**: Each module handles a specific domain (VOD, Live, Analytics, etc.)
2. **DRY (Don't Repeat Yourself)**: Common functionality is shared through base classes
3. **Scalability**: Easy to add new tools without modifying existing code
4. **Maintainability**: Clear structure makes the codebase easy to navigate and update
5. **Testability**: Modular design enables focused unit and integration testing

## Project Structure

```
mcp-server/
├── src/
│   ├── index.ts                  # Main entry point - MCP protocol handler
│   ├── client.ts                 # BlendVision API HTTP client
│   ├── types.ts                  # TypeScript type definitions
│   ├── connector.ts              # HTTP/SSE connector (optional)
│   └── tools/                    # Modular tool organization
│       ├── index.ts              # Tool module exports
│       ├── base_tool.ts          # Base class with shared functionality
│       ├── tool_registry.ts      # Central tool registration system
│       ├── vod_tools.ts          # Video-on-Demand tools (5 tools)
│       ├── live_tools.ts         # Live streaming tools (7 tools)
│       ├── analytics_tools.ts    # Analytics & reporting tools (5 tools)
│       ├── chatroom_tools.ts     # Chatroom tools (4 tools)
│       ├── account_tools.ts      # Account & Playback tools (5 tools)
│       └── clips_tools.ts        # Clips & Auto-tagging tools (6 tools)
├── build/                        # Compiled JavaScript output
├── .mcp.json.example             # MCP configuration template
├── package.json
└── tsconfig.json
```

## Architecture Layers

### Layer 1: Protocol Handler (index.ts)

**Responsibilities:**
- Initialize MCP server
- Handle MCP protocol (stdio JSON-RPC 2.0)
- Route tool calls to appropriate handlers
- Manage server lifecycle

**Key Components:**
```typescript
const server = new Server({ name, version });
const registry = new ToolRegistry();

// Register all tool modules
VODTools.registerTools(registry, vodTools);
LiveTools.registerTools(registry, liveTools);
// ...

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = registry.getHandler(name);
  return await handler(params);
});
```

### Layer 2: Tool Registry (tool_registry.ts)

**Responsibilities:**
- Centralized tool registration
- Tool discovery and lookup
- Handler management

**Features:**
- Register single or multiple tools
- Get tools by name or category
- Type-safe handler storage
- Tool count and metadata

**Example:**
```typescript
const registry = new ToolRegistry();
registry.register(tool, handler);
const handler = registry.getHandler('list_videos');
const allTools = registry.getAllTools();
```

### Layer 3: Tool Modules (vod_tools.ts, live_tools.ts, etc.)

**Responsibilities:**
- Domain-specific tool definitions
- Parameter validation schemas
- Business logic implementation

**Structure:**
```typescript
export class VODTools extends BaseTool {
  static registerTools(registry: ToolRegistry, instance: VODTools) {
    // Register all VOD-related tools
  }

  async listVideos(params: any) {
    // Implementation
  }
}
```

**Tool Categories:**
- **VOD Tools** (5): Video management (list, get, create, update, delete)
- **Live Tools** (7): Live channel and streaming operations
- **Analytics Tools** (5): Usage reports and analytics queries
- **Chatroom Tools** (4): Chatroom and messaging
- **Account Tools** (5): Account, organization, playback tokens
- **Clips Tools** (6): Video clips and auto-tagging

### Layer 4: Base Tool (base_tool.ts)

**Responsibilities:**
- Shared functionality across all tools
- Retry logic with exponential backoff
- Pagination handling
- Error formatting

**Features:**

#### Retry Logic
```typescript
protected async retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 200
): Promise<T>
```
- Exponential backoff (200ms, 400ms, 800ms, ...)
- Configurable max retries
- Error propagation

#### Pagination
```typescript
protected async fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ data: T[]; hasMore: boolean }>,
  maxPages: number = 50
): Promise<T[]>
```
- Automatic page iteration
- Configurable page size (default: 50)
- Safety limit (max 50 pages)

#### Error Handling
```typescript
protected formatResponse<T>(result: { data?: T; error?: any })
protected handleError(error: unknown)
```
- Consistent error format
- User-friendly error messages
- Type-safe responses

### Layer 5: API Client (client.ts)

**Responsibilities:**
- HTTP communication with BlendVision API
- Authentication (Bearer token, org ID)
- Request/response handling
- API-specific logic

**Features:**
- Axios-based HTTP client
- Automatic header injection
- Error handling and formatting
- Support for all BlendVision API endpoints

## Data Flow

```
User Request (Claude)
    ↓
MCP Protocol (stdio)
    ↓
index.ts (Protocol Handler)
    ↓
ToolRegistry.getHandler(toolName)
    ↓
Tool Module (e.g., VODTools)
    ↓
BaseTool (retry, pagination, error handling)
    ↓
BlendVisionClient (HTTP request)
    ↓
BlendVision API
    ↓
Response bubbles back up
```

## Tool Registration Flow

1. **Initialize Client**
   ```typescript
   const client = new BlendVisionClient(config);
   ```

2. **Create Registry**
   ```typescript
   const registry = new ToolRegistry();
   ```

3. **Instantiate Tool Modules**
   ```typescript
   const vodTools = new VODTools(client);
   const liveTools = new LiveTools(client);
   ```

4. **Register Tools**
   ```typescript
   VODTools.registerTools(registry, vodTools);
   LiveTools.registerTools(registry, liveTools);
   ```

5. **Tool Ready for Use**
   - Registry maps tool name → handler
   - MCP server can route calls
   - Tools use shared base functionality

## Adding New Tools

To add a new tool category (e.g., "Meeting Tools"):

1. **Create Tool Module** (`src/tools/meeting_tools.ts`)
   ```typescript
   import { BaseTool } from './base_tool.js';
   import { ToolRegistry } from './tool_registry.js';

   export class MeetingTools extends BaseTool {
     static registerTools(registry: ToolRegistry, instance: MeetingTools) {
       registry.register({
         name: 'create_meeting',
         description: 'Create a new meeting',
         inputSchema: { /* ... */ }
       }, async (params) => instance.createMeeting(params));
     }

     async createMeeting(params: any) {
       // Implementation using this.client and this.retry()
     }
   }
   ```

2. **Export from Index** (`src/tools/index.ts`)
   ```typescript
   export { MeetingTools } from './meeting_tools.js';
   ```

3. **Register in Main** (`src/index.ts`)
   ```typescript
   import { MeetingTools } from './tools/index.js';

   const meetingTools = new MeetingTools(client);
   MeetingTools.registerTools(registry, meetingTools);
   ```

That's it! No need to modify existing code or switch statements.

## Benefits of This Architecture

### 1. Modularity
- Each domain is self-contained
- Easy to find and modify specific functionality
- Tools can be developed independently

### 2. Maintainability
- Clear separation of concerns
- Consistent patterns across all modules
- Easy onboarding for new developers

### 3. Scalability
- Add new tools without touching existing code
- No risk of breaking existing functionality
- Registry handles routing automatically

### 4. Code Reuse
- BaseTool provides common functionality
- No duplicate retry/pagination logic
- Consistent error handling everywhere

### 5. Testability
- Each module can be tested in isolation
- Mock client for unit tests
- Integration tests via registry

### 6. Type Safety
- Full TypeScript support
- Type-safe tool parameters
- Compile-time error detection

## Comparison with Original Architecture

| Aspect | Original | Modular (Current) |
|--------|----------|-------------------|
| Structure | Single 787-line file | 8 focused modules |
| Tool organization | Flat array | Registry + categories |
| Code reuse | Copy-paste patterns | BaseTool inheritance |
| Adding tools | Edit massive switch | Create new module |
| Maintainability | Difficult (1 big file) | Easy (clear modules) |
| Testability | Hard to isolate | Easy per-module tests |
| Line count/file | 787 lines | 50-200 lines |

## Performance Considerations

- **Lazy Loading**: Tools are instantiated once at startup
- **Handler Cache**: Registry caches handlers (O(1) lookup)
- **No Overhead**: Modular structure adds no runtime cost
- **Memory Efficient**: Single instance per tool category

## Error Handling Strategy

1. **Tool Level**: Catch and format errors in tool methods
2. **Base Level**: Common error formatting in BaseTool
3. **Protocol Level**: Final catch in index.ts for MCP errors
4. **Client Level**: HTTP errors formatted in client.ts

All errors return consistent format:
```json
{
  "error": {
    "message": "Human readable message"
  }
}
```

## Future Enhancements

Potential improvements to consider:

1. **Configuration Module**: Centralized config management
2. **Logging System**: Structured logging across modules
3. **Metrics Collection**: Tool usage analytics
4. **Caching Layer**: Response caching for frequent queries
5. **Rate Limiting**: Built-in rate limiting per tool
6. **Validation**: JSON schema validation in BaseTool
7. **Testing Suite**: Automated tests for all modules
8. **Documentation**: Auto-generate tool docs from schemas

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Shopline MCP Architecture](https://github.com/asgard-ai-platform/mcp-shopline)
- [BlendVision API Documentation](https://developers.blendvision.com)
