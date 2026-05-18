// scripts/lib/intel-store/index.d.cts — TypeScript ambient declarations
// for the intel-store CJS module. Plan 27.7-02.

export class IntelNotFoundError extends Error {
  code: 'directory_not_found';
  dir: string;
  constructor(dir: string);
}

export function readSlice(rootDir: string, sliceId: string): Promise<unknown | null>;
export function listSlices(rootDir: string): string[];
