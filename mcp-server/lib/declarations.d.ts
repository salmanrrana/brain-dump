// Type declarations for external modules
declare module 'fs';
declare module 'path';
declare module 'os';
declare module 'crypto';
declare module 'better-sqlite3' {
  export default class Database {
    constructor(path: string, options?: any);
    prepare(sql: string): any;
    pragma(sql: string): any;
    exec(sql: string): any;
    close(): void;
    transaction(fn: () => void): (...args: any[]) => any;
  }
}
