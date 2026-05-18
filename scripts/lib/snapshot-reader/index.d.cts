// scripts/lib/snapshot-reader/index.d.cts — TypeScript ambient declarations
// for the snapshot-reader CJS module. Plan 27.7-02.

export class SnapshotNotFoundError extends Error {
  code: 'directory_not_found';
  dir: string;
  constructor(dir: string);
}

export interface SnapshotPayload {
  /** Snapshot body — shape is JSON-loose; consumers project keys. */
  schema_version?: string;
  timestamp?: string;
  cycle_id?: string;
  state_md_sections?: unknown;
  last_n_events?: unknown[];
  last_n_decisions?: unknown[];
  decisions_count?: number;
  completed_plans_count?: number;
  [k: string]: unknown;
}

export interface ReadSnapshotResult {
  since: string;
  snapshot: SnapshotPayload;
}

export function readLatestSnapshot(rootDir: string): Promise<ReadSnapshotResult | null>;
