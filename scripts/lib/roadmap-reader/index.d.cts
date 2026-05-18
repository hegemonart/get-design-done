// scripts/lib/roadmap-reader/index.d.cts — TypeScript ambient declarations
// for the roadmap-reader CJS module. Plan 27.7-02 — TS imports of CJS
// need .d.cts siblings (Phase 27.6 lesson).

export interface ParsedPhase {
  number: string;
  name: string;
  version: string;
  checkbox_status: 'shipped' | 'planned' | 'unknown';
}

export function readRoadmapMd(rootDir: string): Promise<string>;
export function parsePhases(md: string): ParsedPhase[];
