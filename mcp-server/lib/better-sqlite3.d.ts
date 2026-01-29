 
// Override @types/better-sqlite3 to provide a usable Database type
declare module "better-sqlite3" {
  class Database {
    constructor(path: string, options?: any);
    prepare(sql: string): any;
    pragma(sql: string): any;
    exec(sql: string): any;
    close(): void;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
  }
  export = Database;
}
