/**
 * Minimal ambient types for Bun's built-in SQLite driver, covering
 * exactly the surface the boot scripts use (apply-schema.ts and
 * agentgame-purge.ts). The repo has no @types/bun (the app itself
 * never imports Bun APIs — only these boot scripts do, and they run
 * under Bun, where the module exists).
 */
declare module "bun:sqlite" {
  export interface Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  }
  export class Database {
    constructor(path: string, options?: { create?: boolean });
    exec(sql: string): void;
    query(sql: string): Statement;
    close(): void;
  }
}
