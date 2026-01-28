// Minimal Node.js type declarations for when @types/node isn't available
declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }

  interface Process extends NodeJS.EventEmitter {
    env: ProcessEnv;
    exit(code?: number): never;
    argv: string[];
    cwd(): string;
    pid: number;
  }

  interface EventEmitter {
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
    off(event: string, listener: (...args: any[]) => void): this;
  }

  interface ErrnoException extends Error {
    errno?: number;
    code?: string;
    path?: string;
    syscall?: string;
  }

  type Timer = ReturnType<typeof setInterval>;
  type Timeout = ReturnType<typeof setTimeout>;
}

declare const process: NodeJS.Process;
declare const Buffer: any;
declare function setInterval(callback: (...args: any[]) => void, ms?: number, ...args: any[]): NodeJS.Timer;
declare function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): NodeJS.Timeout;
declare function clearInterval(id: NodeJS.Timer): void;

// child_process module
declare module 'child_process' {
  export function execSync(command: string, options?: any): any;
  export function spawn(command: string, args?: string[], options?: any): any;
}

// MCP SDK modules
declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export class McpServer {
    constructor(options?: any);
    define(tool: any): void;
    request(request: any, resultType: any): Promise<any>;
    connect(transport: any): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor(options?: any);
  }
}
