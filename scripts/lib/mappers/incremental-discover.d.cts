// scripts/lib/mappers/incremental-discover.d.cts — types for incremental-discover.cjs (Phase 53 DISC-01).
//
// Mirrors the .d.cts sidecar convention used by concurrency-tuner.cjs so the
// .ts explore-parallel-runner can import planIncremental without a TS7016
// implicit-any. The runtime module is dep-free CJS (it dynamic-import()s the
// .mjs batchers + the .ts fingerprint engine internally).

/** A community batch (the A-subsystem `computeBatches` shape). */
export interface Batch {
  id: string;
  members: string[];
  mergeable: boolean;
  kind: 'code' | 'token' | 'motion' | 'a11y' | 'misc';
  source: 'louvain' | 'fallback' | 'subsplit' | 'merge';
}

/** A single per-node fingerprint-compare entry fed to the classifier. */
export interface CompareResult {
  id: string;
  type?: string;
  change: 'NONE' | 'COSMETIC' | 'STRUCTURAL';
}

/** The change-classifier result (sdk/fingerprint/classify.cjs). */
export interface Classification {
  action: 'SKIP' | 'PARTIAL_UPDATE' | 'ARCHITECTURE_UPDATE' | 'FULL_UPDATE';
  structuralCount: number;
  pct: number;
  dirChanged: boolean;
  majorRestructure: boolean;
  affectedBatchHints: string[];
  reason: string;
  thresholds: { fullFileCount: number; fullPct: number; archPctMax: number };
}

/** A per-node fingerprint pair plus its node type, as persisted to the store. */
export interface StoredFingerprint {
  full: string;
  structural: string;
  type?: string;
}

/** The neighborMap sidecar for one batch (neighbor-map.mjs shape). */
export interface NeighborMap {
  batchId: string | null;
  neighbors: Record<string, unknown[]>;
  truncated: Record<string, { omitted: number }>;
}

/** Options bag for planIncremental. */
export interface PlanIncrementalOptions {
  /** The `--full` opt-out: force a FULL re-map regardless of the classifier. */
  forceFull?: boolean;
  /** Forwarded to computeBatches (resolution, maxCommunitySize, configCwd, …). */
  computeBatchesOpts?: unknown;
  /** buildNeighborMap cap (default 50). */
  neighborCap?: number;
  /** Forwarded into classify's projectStats.thresholds. */
  thresholds?: unknown;
  /** Force the bootstrap signal off when the store had a snapshot but it was empty. */
  hadPriorBaseline?: boolean;
}

/** The incremental plan returned by planIncremental. */
export interface IncrementalPlan {
  action: 'SKIP' | 'PARTIAL_UPDATE' | 'ARCHITECTURE_UPDATE' | 'FULL_UPDATE';
  batches: Batch[];
  batchesToMap: Batch[];
  neighborMaps: Record<string, NeighborMap>;
  fingerprints: Record<string, StoredFingerprint>;
  compareResults: CompareResult[];
  classification: Classification;
  method: 'louvain' | 'count-fallback';
  modularity: number | null;
}

/** A DirShape derived from node-id provenance. */
export interface DirShape {
  dirs: string[];
  counts: Record<string, number>;
  layerHist: Record<string, number>;
}

/**
 * Plan an incremental discover/explore cycle: compute community batches, run the
 * change classifier against the prior fingerprint snapshot, and elect which
 * batches to re-map (SKIP=[], PARTIAL=affected, FULL=all). Async (it
 * dynamic-import()s the .mjs batchers + the .ts fingerprint engine).
 */
export function planIncremental(args: {
  graph: unknown;
  prevFingerprints?: unknown;
  opts?: PlanIncrementalOptions;
}): Promise<IncrementalPlan>;

/** Pure batch-selection matrix: SKIP→[], FULL→all, PARTIAL/ARCH→hint intersection. */
export function selectBatches(
  batches: Batch[],
  action: string,
  affectedBatchHints: string[],
): Batch[];

/** Derive the current DirShape (+ totalFiles) from a graph's file-nodes. */
export function deriveDirShape(
  graph: unknown,
): DirShape & { totalFiles: number };

/** Reconstruct the prior DirShape from a prevFingerprints map (null when empty). */
export function derivePrevDirShape(
  prevFingerprints: unknown,
): DirShape | null;

/** Build current fingerprints + the compareResults change set for a graph. */
export function buildCompareResults(
  graph: unknown,
  prevFingerprints: unknown,
  fingerprint: (input: unknown, type: string) => { full: string; structural: string },
  compareFingerprints: (
    a: { full: string; structural: string } | null,
    b: { full: string; structural: string } | null,
  ) => string,
): { fingerprints: Record<string, StoredFingerprint>; compareResults: CompareResult[] };

/** Project one fingerprintable node into its per-type fingerprint input. */
export function projectNode(node: unknown, fpType: string, idx: unknown): unknown;

/** Build the once-per-graph relationship index used by projectNode. */
export function indexForProjection(
  graph: unknown,
): { byId: Map<string, unknown>; tokensOf: Map<string, Set<string>>; variantsOf: Map<string, Set<string>> };

/** The graph node `type` values that are independently fingerprinted. */
export const FINGERPRINTABLE: Map<string, string>;
