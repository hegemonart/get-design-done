// scripts/lib/graph/index.mjs — Plan 30.6-02 Task 2
//
// Barrel re-export for graph subcommand handlers. 30.6-03 layers query,
// upsertNode, upsertEdge on top of these exports + the schema/atomic-write
// foundation; 30.6-04 verifies the union decouples from upstream GSD.

export { buildGraph } from './build.mjs';
export { statusGraph } from './status.mjs';
export { diffGraph } from './diff.mjs';
export { compileValidator, SCHEMA_VERSION, SCHEMA } from './schema.mjs';
export { atomicWriteJson } from './atomic-write.mjs';
// query / upsertNode / upsertEdge added by 30.6-03.
