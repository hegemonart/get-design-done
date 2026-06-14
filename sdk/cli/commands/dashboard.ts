// sdk/cli/commands/dashboard.ts — Phase 55 (GDD Dashboard, dep-free) — Web launcher (WEB-03).
//
// `gdd dashboard [--web] [--once] [--no-open]` — the launcher that surfaces the GDD
// dashboard. Two paths, ONE entrypoint:
//
//   * `gdd dashboard`            -> spawn the TUI (`bin/hone-dashboard`, executor D's CJS
//                                   trampoline) and forward stdio + the child exit code.
//   * `gdd dashboard --web`      -> load `.design/context-graph.json` (via the dep-free
//                                   design-context-query `load`; absent/invalid -> a graceful
//                                   EMPTY graph), build a self-contained HTML page with C's
//                                   `buildGraphHtml`, write it to a temp file, serve it over
//                                   `node:http` on an EPHEMERAL free port, open the browser
//                                   (platform `open`/`start`/`xdg-open`), and print the URL.
//                                   Headless (no DISPLAY / CI / `--no-open`) -> print the URL
//                                   only and keep serving.
//   * `gdd dashboard --web --once` -> write the HTML to `<root>/.design/dashboard.html` and
//                                   EXIT 0 without serving or opening (the CI-friendly seam +
//                                   the hermetic test surface).
//
// Constraints (CONTEXT.md D1/D6/D7): ZERO new dependency (Node builtins only:
// node:http, node:child_process, node:fs, node:os, node:path, node:url); READ-ONLY
// (writes nothing but the rendered HTML artifact); sibling resolution via a package-root
// walk-up (the Phase 53/54 lesson), never a fixed `__dirname` cross-tree jump.
//
// Exit codes:
//   * 0 — TUI exited 0 / HTML written (--once) / server launched.
//   * non-0 — forwarded from the spawned TUI.
//   * 3 — arg / config error (invalid flags) or the TUI bin could not be located.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  coerceFlags,
  COMMON_FLAGS,
  type FlagSpec,
  type ParsedArgs,
} from '../parse-args.ts';

// ---------------------------------------------------------------------------
// Flags + usage.
// ---------------------------------------------------------------------------

const DASHBOARD_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'web', type: 'boolean', default: false },
  { name: 'once', type: 'boolean', default: false },
  { name: 'no-open', type: 'boolean', default: false },
  { name: 'root', type: 'string' },
];

export const DASHBOARD_USAGE = `hone-sdk dashboard [flags]

Open the GDD dashboard. Read-only. Dep-free (Node builtins only).

Default (no --web) launches the terminal UI (bin/hone-dashboard). With --web it
emits a self-contained HTML graph of the design-context, serves it on an ephemeral
local port, and opens your browser.

Flags:
  --web            Web mode: build + serve the design-context graph as HTML.
  --once           Write the HTML to .design/dashboard.html and exit (no server). Implies --web.
  --no-open        Web mode: serve + print the URL but do NOT open a browser (headless/CI).
  --root <dir>     Project root to read .design/ from (default: GDD_PROJECT_ROOT or walk-up).
  -h, --help       Show this help.

Exit codes: 0 ok · 3 arg error / TUI not found · (TUI exit code forwarded otherwise)
`;

// ---------------------------------------------------------------------------
// Deps — the dispatcher injects { stdout, stderr }; tests inject the rest for
// hermetic runs (root, a fake browser opener, an explicit headless flag).
// ---------------------------------------------------------------------------

/** A browser opener. Returns true if a launch was attempted. Injected in tests. */
export type BrowserOpener = (url: string) => boolean;

export interface DashboardDeps {
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  /** Project root to read `.design/` from. Overrides flags + env when provided. */
  readonly root?: string;
  /** Inject a fake opener for tests (default: the real platform opener). */
  readonly openBrowser?: BrowserOpener;
  /** Force headless detection (default: auto from env). When true, never opens a browser. */
  readonly headless?: boolean;
  /** Override the TUI bin path resolution (tests). */
  readonly tuiBin?: string;
  /** Override stdio mode for the spawned TUI (tests); default 'inherit'. */
  readonly tuiStdio?: 'inherit' | 'ignore';
}

// ---------------------------------------------------------------------------
// Package-root walk-up. Resolve sibling files (the graph lib, the TUI bin)
// relative to the GDD package root — never a fixed __dirname cross-tree jump
// (the Phase 53/54 lesson). Works from the raw .ts (in-repo) AND the bundled
// .js (packed tarball): we climb from the CLI entry (process.argv[1]) and from
// cwd to the package.json whose name is "hone".
// ---------------------------------------------------------------------------

/**
 * Candidate start directories for the package-root climb, most-specific first.
 * `import.meta`/`__dirname` are unavailable here (tsc rejects `import.meta` for
 * CommonJS output, and strip-types reparses this module as ESM at runtime so
 * `__dirname` is undefined) — so we anchor on the CLI entry (process.argv[1] is
 * `<root>/sdk/cli/index.{ts,js}` or `<root>/bin/hone-sdk` in every real launch,
 * the same anchor build.ts uses) and on cwd (a consumer running from their
 * project root, where the lib lives under node_modules/hone/).
 */
function anchorDirs(): string[] {
  const out: string[] = [];
  const entry = process.argv[1];
  if (typeof entry === 'string' && entry.length > 0) out.push(dirname(entry));
  out.push(process.cwd());
  return out;
}

/** Walk up from `startDir` to the GDD package root (package.json name === hone). */
function climbToMarker(startDir: string): { root: string | null; firstWithPkg: string | null } {
  const req = createRequire(join(startDir, 'noop.js'));
  let dir = startDir;
  let firstWithPkg: string | null = null;
  for (let i = 0; i < 12; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      if (firstWithPkg === null) firstWithPkg = dir;
      try {
        const pkg = req(pkgPath) as { name?: string };
        if (pkg && pkg.name === 'hone') return { root: dir, firstWithPkg };
      } catch {
        /* unreadable package.json — keep climbing */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { root: null, firstWithPkg };
}

/**
 * Resolve the GDD package root by climbing from each anchor (CLI entry, then cwd)
 * until the `hone` marker is found. Falls back to the first ancestor
 * that has ANY package.json, then to cwd. Memoized per process.
 */
let _cachedPkgRoot: string | null = null;
function findPackageRoot(): string {
  if (_cachedPkgRoot !== null) return _cachedPkgRoot;
  let fallback: string | null = null;
  for (const anchor of anchorDirs()) {
    const { root, firstWithPkg } = climbToMarker(anchor);
    if (root) {
      _cachedPkgRoot = root;
      return root;
    }
    if (fallback === null && firstWithPkg !== null) fallback = firstWithPkg;
  }
  _cachedPkgRoot = fallback ?? process.cwd();
  return _cachedPkgRoot;
}

/** require() an in-repo .cjs sibling resolved from the package root. */
function requireFromRoot<T>(relPath: string): T {
  const root = findPackageRoot();
  const req = createRequire(join(root, 'noop.js'));
  return req(join(root, relPath)) as T;
}

// The C-interface graph HTML emitter + the dep-free graph query lib. Both are
// .cjs — require()d via the walk-up. Typed loosely (no .d.ts for these libs).
interface GraphLib {
  load(graphPath: string): unknown;
}
interface GraphHtmlLib {
  buildGraphHtml(graph: unknown, opts?: { title?: string }): string;
}

// ---------------------------------------------------------------------------
// Root resolution: deps.root > --root flag > GDD_PROJECT_ROOT > package root.
// ---------------------------------------------------------------------------

function resolveRoot(deps: DashboardDeps, flags: Record<string, unknown>): string {
  if (typeof deps.root === 'string' && deps.root.length > 0) return deps.root;
  const flagRoot = flags['root'];
  if (typeof flagRoot === 'string' && flagRoot.length > 0) return flagRoot;
  if (process.env['GDD_PROJECT_ROOT']) return process.env['GDD_PROJECT_ROOT'];
  return findPackageRoot();
}

// ---------------------------------------------------------------------------
// Graph -> HTML. Graceful: missing/invalid graph -> a valid EMPTY-graph doc.
// ---------------------------------------------------------------------------

/** Load the design-context graph, or an empty graph on any failure (never throws). */
function loadGraphGraceful(root: string, stderr: NodeJS.WritableStream): unknown {
  const graphPath = join(root, '.design', 'context-graph.json');
  try {
    const query = requireFromRoot<GraphLib>('scripts/lib/design-context-query.cjs');
    if (typeof query.load === 'function') return query.load(graphPath);
  } catch (err) {
    stderr.write(
      `hone-sdk dashboard: no design-context graph at ${graphPath} (${errMsg(err)}); rendering an empty graph.\n`,
    );
  }
  return { nodes: [], edges: [] };
}

/** Build the dashboard HTML string from the project's graph (graceful-empty). */
export function buildDashboardHtml(root: string, stderr: NodeJS.WritableStream): string {
  const graph = loadGraphGraceful(root, stderr);
  const htmlLib = requireFromRoot<GraphHtmlLib>('scripts/lib/dashboard/graph-html.cjs');
  return htmlLib.buildGraphHtml(graph, { title: 'GDD Design Context Graph' });
}

// ---------------------------------------------------------------------------
// Headless detection + the platform browser opener.
// ---------------------------------------------------------------------------

/**
 * Headless when: explicitly forced, `--no-open`, CI is set, or no display surface
 * (Linux without DISPLAY/WAYLAND_DISPLAY). macOS + Windows always have a GUI shell.
 */
function isHeadless(deps: DashboardDeps, flags: Record<string, unknown>): boolean {
  if (typeof deps.headless === 'boolean') return deps.headless;
  if (flags['no-open'] === true) return true;
  if (process.env['CI']) return true;
  if (process.platform === 'linux') {
    return !process.env['DISPLAY'] && !process.env['WAYLAND_DISPLAY'];
  }
  return false;
}

/** Real platform opener: macOS `open`, Windows `start ""`, else `xdg-open`. Detached, never blocks. */
function defaultOpenBrowser(url: string): boolean {
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      // `start` is a cmd builtin; the empty "" is the window-title arg so a URL with
      // spaces/ampersands is treated as the target, not the title.
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ephemeral free-port HTTP server. Listen on port 0; the OS assigns a free port
// which we read back from server.address(). Serves the single HTML page for any
// path; everything else is the same document (a one-page app).
// ---------------------------------------------------------------------------

export interface ServeResult {
  readonly server: Server;
  readonly port: number;
  readonly url: string;
}

/**
 * Start a read-only HTTP server on an ephemeral port serving `html`. Resolves once
 * the OS has bound a port. The caller owns the returned server's lifecycle (close()).
 */
export function serveHtml(html: string): Promise<ServeResult> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
    });
    server.on('error', reject);
    // Bind loopback only (never expose on a LAN interface) + ephemeral port 0.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        server.close();
        reject(new Error('could not determine the ephemeral server port'));
        return;
      }
      const port = addr.port;
      resolve({ server, port, url: `http://127.0.0.1:${port}/` });
    });
  });
}

// ---------------------------------------------------------------------------
// Command.
// ---------------------------------------------------------------------------

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function dashboardCommand(
  parsed: ParsedArgs,
  deps: DashboardDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (parsed.flags['help'] === true || parsed.flags['h'] === true) {
    stdout.write(DASHBOARD_USAGE);
    return 0;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(parsed, DASHBOARD_FLAGS);
  } catch {
    stderr.write(`hone-sdk dashboard: invalid flags\n${DASHBOARD_USAGE}`);
    return 3;
  }

  // `--once` implies web mode (write-and-exit makes no sense for the TUI).
  const once = flags['once'] === true;
  const web = flags['web'] === true || once;

  if (!web) {
    return runTui(deps, stdout, stderr);
  }

  const root = resolveRoot(deps, flags);
  const html = buildDashboardHtml(root, stderr);

  // --- --once: write the artifact to .design/dashboard.html and exit. ---------
  if (once) {
    const designDir = join(root, '.design');
    try {
      mkdirSync(designDir, { recursive: true });
    } catch {
      /* dir may already exist or be unwritable; the write below surfaces real errors */
    }
    const outFile = join(designDir, 'dashboard.html');
    try {
      writeFileSync(outFile, html, 'utf8');
    } catch (err) {
      stderr.write(`hone-sdk dashboard: could not write ${outFile}: ${errMsg(err)}\n`);
      return 3;
    }
    stdout.write(`Wrote dashboard HTML to ${outFile}\n`);
    return 0;
  }

  // --- --web: serve on an ephemeral port + open the browser (or print URL). ---
  let served: ServeResult;
  try {
    served = await serveHtml(html);
  } catch (err) {
    stderr.write(`hone-sdk dashboard: could not start the web server: ${errMsg(err)}\n`);
    return 3;
  }

  const headless = isHeadless(deps, flags);
  const opener = deps.openBrowser ?? defaultOpenBrowser;

  stdout.write(`GDD dashboard serving at ${served.url}\n`);
  if (headless) {
    stdout.write('Headless environment detected — open the URL above in a browser.\n');
    stdout.write('Press Ctrl+C to stop the server.\n');
  } else {
    const launched = opener(served.url);
    if (!launched) {
      stdout.write('Could not auto-open a browser — open the URL above manually.\n');
    }
    stdout.write('Press Ctrl+C to stop the server.\n');
  }

  // Keep the process alive while serving. The server keeps the event loop busy;
  // SIGINT/SIGTERM close it and resolve so the CLI exits 0 cleanly.
  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      served.server.close(() => resolve());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    served.server.on('close', () => resolve());
  });
  return 0;
}

// ---------------------------------------------------------------------------
// TUI launch (default path). Spawn bin/hone-dashboard, forward stdio + exit code.
// ---------------------------------------------------------------------------

function runTui(
  deps: DashboardDeps,
  _stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): number {
  let bin = deps.tuiBin;
  if (!bin) {
    const root = findPackageRoot();
    const candidate = join(root, 'bin', 'hone-dashboard');
    bin = existsSync(candidate) ? candidate : undefined;
  }
  if (!bin || !existsSync(bin)) {
    stderr.write(
      'hone-sdk dashboard: could not locate bin/hone-dashboard (the terminal UI).\n' +
        'Try `gdd dashboard --web` for the browser graph instead.\n',
    );
    return 3;
  }
  const stdio = deps.tuiStdio ?? 'inherit';
  const res = spawnSync(process.execPath, [bin], { stdio });
  if (res.error) {
    stderr.write(`hone-sdk dashboard: failed to launch the TUI: ${res.error.message}\n`);
    return 3;
  }
  return typeof res.status === 'number' ? res.status : 0;
}
