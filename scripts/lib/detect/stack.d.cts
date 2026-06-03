// scripts/lib/detect/stack.d.cts — types for detect/stack.cjs (Phase 54 DETECT-01).

export interface StackEvidence {
  ds?: string;
  framework?: string;
  motion?: string[];
  note?: string;
}

export interface DetectedStack {
  /** Detected design-system id (tailwind / shadcn / mui / ...), or null. */
  ds: string | null;
  /** Detected framework id (nextjs / remix / vite-react / ...), or null. */
  framework: string | null;
  /** Detected motion library ids (framer-motion / gsap / ...). Possibly empty. */
  motion_libs: string[];
  /** Per-category evidence strings (why each value was chosen). */
  evidence: StackEvidence;
}

export interface ReadDepsResult {
  deps: Record<string, string>;
  present: boolean;
  error: string | null;
}

/**
 * Fingerprint a project's design-system / framework / motion stack. Pure,
 * dependency-free, NEVER throws — an absent/malformed package.json yields
 * all-null with an evidence note.
 * @param root project directory (defaults to process.cwd()).
 */
export function detectStack(root?: string): DetectedStack;

export function readDeps(root: string): ReadDepsResult;
export function hasDep(deps: Record<string, string>, name: string): boolean;
export function hasDepPrefix(deps: Record<string, string>, prefix: string): boolean;
export function detectDs(root: string, deps: Record<string, string>): { ds: string | null; evidence: string };
export function detectFramework(root: string, deps: Record<string, string>): { framework: string | null; evidence: string };
export function detectMotion(deps: Record<string, string>): { motion_libs: string[]; evidence: string[] };
export function main(argv: string[], io?: { cwd?: string; log?: (s: string) => void; err?: (s: string) => void }): number;
export function parseArgs(argv: string[]): { root: string | null; json: boolean; pretty: boolean; help: boolean };
export const HELP: string;
export const SKIP_DIRS: ReadonlySet<string> | string[];
