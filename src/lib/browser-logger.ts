/**
 * Browser-safe logger for client-side React code.
 *
 * Unlike the main logger.ts which uses Node.js filesystem APIs,
 * this logger works in browser environments by outputting to console.
 *
 * Use this for React hooks and components that run in the browser.
 * Use logger.ts for server-side code (API routes, CLI, MCP server).
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface BrowserLogger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string, error?: Error) => void;
  error: (message: string, error?: Error) => void;
}

/**
 * Create a browser-safe logger with a source identifier.
 *
 * @param source - Identifier for the log source (e.g., "hooks", "components")
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * ```typescript
 * const logger = createBrowserLogger("hooks");
 * logger.error("Failed to create ticket", new Error("Network error"));
 * // Output: [hooks] ERROR: Failed to create ticket
 * //         Error: Network error
 * //         at ...
 * ```
 */
export function createBrowserLogger(source: string): BrowserLogger {
  const prefix = `[${source}]`;

  return {
    debug: (message: string) => {
      if (process.env.NODE_ENV === "development") {
        console.debug(`${prefix} DEBUG:`, message);
      }
    },

    info: (message: string) => {
      console.info(`${prefix} INFO:`, message);
    },

    warn: (message: string, error?: Error) => {
      if (error) {
        console.warn(`${prefix} WARN:`, message, error);
      } else {
        console.warn(`${prefix} WARN:`, message);
      }
    },

    error: (message: string, error?: Error) => {
      if (error) {
        console.error(`${prefix} ERROR:`, message, error);
      } else {
        console.error(`${prefix} ERROR:`, message);
      }
    },
  };
}
