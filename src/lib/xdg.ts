import { homedir, platform as osPlatform } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { mkdir, access, constants } from "fs/promises";

const APP_NAME = "brain-dump";

export type Platform = "linux" | "darwin" | "win32" | "other";

let platformOverride: Platform | null = null;

/** @internal - Only for use in tests */
export function _setPlatformOverride(p: Platform | null): void {
  platformOverride = p;
}

export function getPlatform(): Platform {
  if (platformOverride !== null) {
    return platformOverride;
  }
  const p = osPlatform();
  if (p === "linux" || p === "darwin" || p === "win32") {
    return p;
  }
  return "other";
}

export function isLinux(): boolean {
  return getPlatform() === "linux";
}

export function isMacOS(): boolean {
  return getPlatform() === "darwin";
}

export function isWindows(): boolean {
  return getPlatform() === "win32";
}

export function getDataDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  if (p === "win32") {
    const appData = process.env.APPDATA;
    const base = appData || join(homedir(), "AppData", "Roaming");
    return join(base, APP_NAME);
  }

  const xdgDataHome = process.env.XDG_DATA_HOME;
  const base = xdgDataHome || join(homedir(), ".local", "share");
  return join(base, APP_NAME);
}

export function getConfigDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  if (p === "win32") {
    const appData = process.env.APPDATA;
    const base = appData || join(homedir(), "AppData", "Roaming");
    return join(base, APP_NAME);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const base = xdgConfigHome || join(homedir(), ".config");
  return join(base, APP_NAME);
}

export function getCacheDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    return join(homedir(), "Library", "Caches", APP_NAME);
  }

  if (p === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const base = localAppData || join(homedir(), "AppData", "Local");
    return join(base, APP_NAME, "cache");
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const base = xdgCacheHome || join(homedir(), ".cache");
  return join(base, APP_NAME);
}

export function getStateDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME, "state");
  }

  if (p === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const base = localAppData || join(homedir(), "AppData", "Local");
    return join(base, APP_NAME, "state");
  }

  const xdgStateHome = process.env.XDG_STATE_HOME;
  const base = xdgStateHome || join(homedir(), ".local", "state");
  return join(base, APP_NAME);
}

export function getLegacyDir(): string {
  return join(homedir(), ".brain-dump");
}

export function getDatabasePath(): string {
  return join(getDataDir(), "brain-dump.db");
}

export function getBackupsDir(): string {
  return join(getStateDir(), "backups");
}

export function getLogsDir(): string {
  return join(getStateDir(), "logs");
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir, constants.F_OK);
  } catch {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
}

export async function ensureDirectories(): Promise<void> {
  await Promise.all([
    ensureDir(getDataDir()),
    ensureDir(getConfigDir()),
    ensureDir(getCacheDir()),
    ensureDir(getStateDir()),
    ensureDir(getBackupsDir()),
    ensureDir(getLogsDir()),
  ]);
}

export function ensureDirectoriesSync(): void {
  const dirs = [
    getDataDir(),
    getConfigDir(),
    getCacheDir(),
    getStateDir(),
    getBackupsDir(),
    getLogsDir(),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}
