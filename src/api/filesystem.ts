import { createServerFn } from "@tanstack/react-start";

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface ListDirectoryResult {
  path: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
}

// Validate and sanitize a path to prevent path traversal attacks
function validatePath(inputPath: string): string {
  // Check for null bytes (common attack vector)
  if (inputPath.includes("\0")) {
    throw new Error("Invalid path: contains null bytes");
  }

  // Check for obviously malicious patterns
  const parentDirMatches = inputPath.match(/\.\.[\\/]/g);
  if (
    inputPath.includes("..") &&
    (inputPath.includes("../..") || (parentDirMatches && parentDirMatches.length > 3))
  ) {
    throw new Error("Invalid path: excessive parent directory traversal");
  }

  // Reject paths that look like they're trying to access sensitive system paths
  const sensitivePaths = ["/etc/passwd", "/etc/shadow", "/proc", "/sys"];
  const normalizedLower = inputPath.toLowerCase();
  for (const sensitive of sensitivePaths) {
    if (normalizedLower.startsWith(sensitive)) {
      throw new Error(`Access denied: cannot access ${sensitive}`);
    }
  }

  return inputPath;
}

// List contents of a directory
export const listDirectory = createServerFn({ method: "GET" })
  .inputValidator((path: string) => {
    if (!path || typeof path !== "string") {
      throw new Error("Path is required");
    }
    return path;
  })
  .handler(async ({ data: dirPath }): Promise<ListDirectoryResult> => {
    const { readdir, stat, realpath } = await import("fs/promises");
    const { join, dirname, resolve } = await import("path");
    const { homedir } = await import("os");

    // Validate input path
    validatePath(dirPath);

    // Resolve path (handle ~ for home directory)
    let resolvedPath = dirPath;
    if (dirPath.startsWith("~")) {
      resolvedPath = join(homedir(), dirPath.slice(1));
    }
    resolvedPath = resolve(resolvedPath);

    // Resolve symlinks to get the real path
    try {
      resolvedPath = await realpath(resolvedPath);
    } catch {
      // If realpath fails, continue with the resolved path
    }

    // Validate the resolved path as well
    validatePath(resolvedPath);

    // Get parent path
    const parentPath = dirname(resolvedPath);
    const hasParent = parentPath !== resolvedPath;

    try {
      const items = await readdir(resolvedPath);
      const entries: DirectoryEntry[] = [];

      for (const item of items) {
        // Skip hidden files/directories
        if (item.startsWith(".")) continue;

        const itemPath = join(resolvedPath, item);
        try {
          const stats = await stat(itemPath);
          if (stats.isDirectory()) {
            entries.push({
              name: item,
              path: itemPath,
              isDirectory: true,
            });
          }
        } catch {
          // Skip items we can't access
        }
      }

      // Sort alphabetically
      entries.sort((a, b) => a.name.localeCompare(b.name));

      return {
        path: resolvedPath,
        parentPath: hasParent ? parentPath : null,
        entries,
      };
    } catch (error) {
      throw new Error(
        `Cannot read directory: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

// Create a new directory
export const createDirectory = createServerFn({ method: "POST" })
  .inputValidator((data: { parentPath: string; name: string }) => {
    if (!data.parentPath || typeof data.parentPath !== "string") {
      throw new Error("Parent path is required");
    }
    if (!data.name || typeof data.name !== "string") {
      throw new Error("Directory name is required");
    }
    return data;
  })
  .handler(async ({ data: { parentPath, name } }): Promise<string> => {
    const { mkdir } = await import("fs/promises");
    const { join, resolve } = await import("path");
    const { homedir } = await import("os");

    // Validate parent path
    validatePath(parentPath);

    // Resolve parent path
    let resolvedParent = parentPath;
    if (parentPath.startsWith("~")) {
      resolvedParent = join(homedir(), parentPath.slice(1));
    }
    resolvedParent = resolve(resolvedParent);

    // Validate name (no path separators, not empty, no special chars)
    if (!name || name.includes("/") || name.includes("\\") || name.includes("\0")) {
      throw new Error("Invalid directory name");
    }

    // Also check for . and .. which could be used for traversal
    if (name === "." || name === "..") {
      throw new Error("Invalid directory name");
    }

    const newPath = join(resolvedParent, name);

    // Validate the resulting path
    validatePath(newPath);

    try {
      await mkdir(newPath);
      return newPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("Directory already exists");
      }
      throw new Error(
        `Cannot create directory: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

// Get home directory
export const getHomeDirectory = createServerFn({ method: "GET" })
  .inputValidator(() => {})
  .handler(async (): Promise<string> => {
    const { homedir } = await import("os");
    return homedir();
  });
