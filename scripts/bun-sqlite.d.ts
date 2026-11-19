/**
 * Minimal ambient types for Bun's built-in SQLite driver, covering
 * exactly the surface scripts/apply-schema.ts uses. The repo has no
 * @types/bun (the app itself never imports Bun APIs — only this
 * boot script does, and it runs under Bun, where the module exists).
 */
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { create?: boolean });
    exec(sql: string): void;
    query(sql: string): {
      all(): unknown[];
      get(): unknown;
    };
    close(): void;
  }
}
