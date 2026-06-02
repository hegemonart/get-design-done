// sdk/cli/commands/build.ts — Phase 42 (COMPILE-06).
//
// `gdd-sdk build skills [--harness <id>] [--zip] [--check]` — compile the per-harness skill bundles
// from source/skills/ via the orchestrator scripts/build-skills.cjs. The orchestrator is a separate
// dep-free CJS process (no bundling entanglement with the SDK); we resolve it relative to the package
// root and spawn it, forwarding stdout/stderr.
//
// Exit codes:
//   * 0 — build (or --check) succeeded.
//   * 1 — --check found drift (committed != generated).
//   * 3 — arg / config error (missing/unknown target).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  coerceFlags,
  COMMON_FLAGS,
  type FlagSpec,
  type ParsedArgs,
} from '../parse-args.ts';

const BUILD_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'harness', type: 'string' },
  { name: 'zip', type: 'boolean' },
  { name: 'check', type: 'boolean' },
];

export const BUILD_USAGE = `gdd-sdk build skills [flags]

Compile per-harness skill bundles from source/skills/ into dist/<bundle>/ (and regenerate the
committed Claude-Code surface skills/). One source, N provider bundles.

Flags:
  --harness <id>   Build only one harness (e.g. claude, codex, gemini). Default: all 14.
  --zip            Also package each bundle as dist/<bundle>.tgz (needs tar).
  --check          Verify committed skills/ + dist/claude-code/ match source/ (the drift gate); no writes.
  -h, --help       Show this help.

Exit codes: 0 ok · 1 drift (--check) · 3 arg error
`;

interface CommandCtx {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/** Walk up from the CLI entry (argv[1]) to the package root that holds scripts/build-skills.cjs. */
function findOrchestrator(): string | null {
  let dir = dirname(process.argv[1] ?? process.cwd());
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'scripts', 'build-skills.cjs');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwdCandidate = join(process.cwd(), 'scripts', 'build-skills.cjs');
  return existsSync(cwdCandidate) ? cwdCandidate : null;
}

export async function buildCommand(parsed: ParsedArgs, ctx: CommandCtx): Promise<number> {
  if (parsed.flags['help'] === true || parsed.flags['h'] === true) {
    ctx.stdout.write(BUILD_USAGE);
    return 0;
  }

  const target = parsed.positionals[0];
  if (target !== 'skills') {
    ctx.stderr.write(`gdd-sdk build: expected target "skills" (got ${target ? `"${target}"` : 'nothing'})\n${BUILD_USAGE}`);
    return 3;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(parsed, BUILD_FLAGS);
  } catch {
    ctx.stderr.write(`gdd-sdk build: invalid flags\n${BUILD_USAGE}`);
    return 3;
  }

  const script = findOrchestrator();
  if (!script) {
    ctx.stderr.write('gdd-sdk build: could not locate scripts/build-skills.cjs\n');
    return 3;
  }

  const orchestratorArgs: string[] = [];
  if (flags['check'] === true) orchestratorArgs.push('--check');
  if (flags['zip'] === true) orchestratorArgs.push('--zip');
  const harness = flags['harness'];
  if (typeof harness === 'string' && harness.length > 0) {
    orchestratorArgs.push('--harness', harness);
  }

  const res = spawnSync(process.execPath, [script, ...orchestratorArgs], { encoding: 'utf8' });
  if (res.stdout) ctx.stdout.write(res.stdout);
  if (res.stderr) ctx.stderr.write(res.stderr);
  if (res.error) {
    ctx.stderr.write(`gdd-sdk build: failed to run orchestrator: ${res.error.message}\n`);
    return 3;
  }
  return typeof res.status === 'number' ? res.status : 3;
}
