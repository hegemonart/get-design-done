// scripts/lib/reflections-reader/index.d.cts — TypeScript ambient declarations
// for the reflections-reader CJS module. Plan 27.7-02.

export class ReflectionsNotFoundError extends Error {
  code: 'directory_not_found';
  dir: string;
  constructor(dir: string);
}

export interface Reflection {
  cycle: string;
  path: string;
  content: string;
}

export function readLatestReflection(rootDir: string): Promise<Reflection | null>;
export function readNReflections(rootDir: string, n: number): Promise<Reflection[]>;
export function digestReflections(reflections: Reflection[]): string;
