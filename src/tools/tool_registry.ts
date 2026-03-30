import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool Registry for managing and organizing MCP tools
 * Provides centralized registration and discovery of tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, (params: any) => Promise<any>> = new Map();

  /**
   * Register a single tool with its handler
   */
  register(tool: Tool, handler: (params: any) => Promise<any>): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
  }

  /**
   * Register multiple tools at once
   */
  registerMany(tools: Array<{ tool: Tool; handler: (params: any) => Promise<any> }>): void {
    tools.forEach(({ tool, handler }) => {
      this.register(tool, handler);
    });
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get handler for a specific tool
   */
  getHandler(name: string): ((params: any) => Promise<any>) | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tools by category (based on name prefix)
   */
  getToolsByCategory(category: string): Tool[] {
    return Array.from(this.tools.values()).filter(tool =>
      tool.name.startsWith(category.toLowerCase())
    );
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get total number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }
}
