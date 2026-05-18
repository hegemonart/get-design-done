// scripts/lib/install/mcp-register.d.cts
// ---------------------------------------------------------------------------
// Plan 27.7-04 — TypeScript ambient declarations for the mcp-register lib.
// Sibling .d.cts kept in sync with mcp-register.cjs (Phase 27.6 lesson —
// precautionary for TS consumers).

import type { spawnSync } from 'node:child_process';

export interface Harness {
  readonly binary: string;
  readonly addArgs: readonly string[];
  readonly listArgs: readonly string[];
  readonly listMatchPattern: RegExp;
}

export const HARNESSES: Readonly<Record<'claude' | 'codex', Harness>>;
export const MCP_NAME: string;

export type HarnessId = 'claude' | 'codex';
export type RegisterMode = 'register' | 'unregister' | 'detect';

export interface RegisterMcpResult {
  harness: HarnessId;
  action: RegisterMode;
  detected: boolean;
  command: string | null;
  applied: boolean;
  idempotent_skip: boolean;
  notice?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number | null;
  dry_run?: boolean;
}

export interface HarnessDetectEntry {
  harness: HarnessId;
  present: boolean;
  registered: boolean | undefined;
}

export interface DetectResult {
  harnesses: HarnessDetectEntry[];
  summary: string;
}

export type SpawnFn = typeof spawnSync;

export interface RegisterMcpOptions {
  harness: HarnessId;
  mode?: RegisterMode;
  dryRun?: boolean;
  spawnFn?: SpawnFn;
}

export interface DetectMcpRegistrationOptions {
  spawnFn?: SpawnFn;
}

export function registerMcp(opts: RegisterMcpOptions): RegisterMcpResult;
export function detectMcpRegistration(opts?: DetectMcpRegistrationOptions): DetectResult;
export function detectHarnessPresent(harness: HarnessId, spawnFn?: SpawnFn): boolean;
export function isAlreadyRegistered(harness: HarnessId, spawnFn?: SpawnFn): boolean;
export function buildHarnessCommand(harness: HarnessId, mode?: RegisterMode): { binary: string; args: string[] };
