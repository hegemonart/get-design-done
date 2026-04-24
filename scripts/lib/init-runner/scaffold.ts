// scripts/lib/init-runner/scaffold.ts — filesystem helpers for the
// `gdd-sdk init` runner (Plan 21-08, SDK-20).
//
// This module is synchronous + side-effectful; every helper either
// mutates disk in a well-defined way or reports a boolean/null/string
// result. No session-runner / SDK dependencies — keep it cheap to test.
//
// Helpers exported:
//
//   * writeStateFromTemplate   — copy reference/STATE-TEMPLATE.md →
//                                .design/STATE.md with `{TODAY}` replaced.
//   * backupExistingDesignDir  — rename `.design/` to `.design.backup.<ISO>/`.
//   * resolveStateTemplatePath — walk up from process.argv[1]/cwd to find
//                                the plugin package root, then join
//                                reference/STATE-TEMPLATE.md.
//   * ensureDesignDirs         — `mkdir -p` both `.design/` and
//                                `.design/research/`.
//
// All helpers are pure w.r.t. filesystem ordering — every caller can
// invoke them in any order without corrupting a concurrent init.

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The plugin's package.json `name` field used to anchor the walk-up in
 *  `resolveStateTemplatePath`. */
const PLUGIN_PACKAGE_NAME = '@hegemonart/get-design-done';

/** Maximum directories to climb looking for the plugin root. Eight
 *  matches session-runner's repo-root discovery depth — a forgiving
 *  upper bound without being pathological. */
const MAX_WALKUP_DEPTH = 8;

// ---------------------------------------------------------------------------
// writeStateFromTemplate
// ---------------------------------------------------------------------------

/**
 * Copy `templatePath` to `destPath`, replacing every `{TODAY}` token
 * with today's ISO date (`YYYY-MM-DD`). Other placeholders (e.g.,
 * `{PROJECT_NAME}`) are left verbatim for the user to fill in later.
 *
 * Returns `true` on success, `false` when the template is missing.
 * Never throws for expected failure modes; unexpected errors (permission
 * denied, out of disk) surface as thrown errors since the caller cannot
 * meaningfully recover.
 */
export function writeStateFromTemplate(args: {
  readonly cwd: string;
  readonly templatePath: string;
  readonly destPath: string;
}): boolean {
  const { templatePath, destPath } = args;

  if (!existsSync(templatePath)) return false;

  // Read template → substitute `{TODAY}` → write to dest. If the template
  // has no `{TODAY}` token we write it verbatim (plan spec: "Template
  // without placeholder → copied verbatim").
  const raw = readFileSync(templatePath, 'utf8');
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const body = raw.includes('{TODAY}')
    ? raw.split('{TODAY}').join(today)
    : raw;

  // Ensure destination directory exists before writing.
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, body, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// backupExistingDesignDir
// ---------------------------------------------------------------------------

/**
 * If `.design/` exists inside `cwd`, move it aside to
 * `.design.backup.<ISO>/` (ISO safe-for-filename form) and return the
 * backup directory path. Returns `null` when nothing exists to back up.
 *
 * Rename is the default (atomic on same filesystem); on EXDEV or any
 * other rename error we fall back to recursive copy + rm.
 */
export function backupExistingDesignDir(cwd: string): string | null {
  const designDir = resolve(cwd, '.design');
  if (!existsSync(designDir)) return null;

  // ISO → filesystem-safe: replace ':' and '.' (e.g. 2026-04-24T10:15:30.123Z
  // → 2026-04-24T10-15-30-123Z) so Windows accepts the directory name.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let backupDir = resolve(cwd, `.design.backup.${stamp}`);

  // Collision guard — sub-millisecond double-invoke could land on the
  // same ISO stamp. Append a numeric suffix until the path is free.
  let suffix = 0;
  while (existsSync(backupDir)) {
    suffix += 1;
    backupDir = resolve(cwd, `.design.backup.${stamp}-${suffix}`);
    if (suffix > 1000) {
      // Pathological — bail rather than loop forever.
      throw new Error(`backupExistingDesignDir: could not find a free backup directory after ${suffix} attempts`);
    }
  }

  try {
    renameSync(designDir, backupDir);
  } catch (err) {
    // EXDEV (cross-volume), EPERM (Windows permissions), or anything
    // else — try recursive copy + rm as a slower fallback.
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'EXDEV' || code === 'EPERM' || code === 'ENOTEMPTY') {
      cpSync(designDir, backupDir, { recursive: true });
      rmSync(designDir, { recursive: true, force: true });
    } else {
      throw err;
    }
  }

  return backupDir;
}

// ---------------------------------------------------------------------------
// ensureDesignDirs
// ---------------------------------------------------------------------------

/**
 * Create `.design/` and `.design/research/` inside `cwd` (`mkdir -p`).
 * Idempotent — safe to call on an already-initialized project. Returns
 * the resolved absolute paths so callers can drop them directly into
 * `writeStateFromTemplate({destPath: ...})`.
 */
export function ensureDesignDirs(cwd: string): {
  readonly design_dir: string;
  readonly research_dir: string;
} {
  const designDir = resolve(cwd, '.design');
  const researchDir = join(designDir, 'research');
  mkdirSync(designDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });
  return Object.freeze({ design_dir: designDir, research_dir: researchDir });
}

// ---------------------------------------------------------------------------
// resolveStateTemplatePath
// ---------------------------------------------------------------------------

/**
 * Walk up from `process.argv[1]`'s directory (falling back to cwd if
 * argv[1] isn't a real path) looking for a `package.json` whose `name`
 * field matches `@hegemonart/get-design-done`. When found, return
 * `<pkg-root>/reference/STATE-TEMPLATE.md`. Return `null` if we run out
 * of parent directories without finding the plugin root — e.g., when
 * invoked from a fork that has renamed the package.
 *
 * The walk is bounded to `MAX_WALKUP_DEPTH` (8) to stop us from
 * traversing the entire filesystem on pathological inputs.
 */
export function resolveStateTemplatePath(): string | null {
  const startCandidates: string[] = [];
  // argv[1] is the executing script's path (e.g., bin wrapper).
  const argv1 = process.argv[1];
  if (argv1 !== undefined && argv1.length > 0 && existsSync(argv1)) {
    startCandidates.push(dirname(resolve(argv1)));
  }
  // Fall back to cwd for cases where argv[1] isn't meaningful (tests,
  // repl, etc.).
  startCandidates.push(process.cwd());

  for (const start of startCandidates) {
    let dir = start;
    for (let depth = 0; depth < MAX_WALKUP_DEPTH; depth += 1) {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const raw = readFileSync(pkgPath, 'utf8');
          const parsed = JSON.parse(raw) as { name?: unknown };
          if (parsed.name === PLUGIN_PACKAGE_NAME) {
            const tpl = join(dir, 'reference', 'STATE-TEMPLATE.md');
            if (existsSync(tpl)) return tpl;
          }
        } catch {
          // Malformed package.json — keep walking; maybe a parent has it.
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers (kept exported for tests that want to drill in)
// ---------------------------------------------------------------------------

/** Expose copy-then-write as a unit for tests that want to bypass the
 *  template-path existence check. Public but undocumented in the index. */
export function _copyTemplateVerbatim(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

/** Size of a file on disk, or 0 if missing. Used by the researcher
 *  dispatcher to measure `output_bytes` without bubbling up EEXIST /
 *  ENOENT. */
export function fileSize(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}
