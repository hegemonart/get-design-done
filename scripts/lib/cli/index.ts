// scripts/lib/cli/index.ts — Plan 21-09 Task 7 (SDK-21).
//
// Main dispatcher for the `gdd-sdk` CLI. Invoked by `bin/gdd-sdk` (the
// CJS trampoline) with `--experimental-strip-types` so TS runs without
// a build step.
//
// Responsibilities:
//   * Parse argv via parseArgs().
//   * Route by first positional to the matching subcommand module.
//   * Print top-level USAGE on bare `gdd-sdk` / `-h` / `--help`.
//   * Exit with the subcommand's return code. Unknown subcommands
//     exit 3 and print USAGE to stderr.
//
// The bottom of this file has the `main()` bootstrap that the trampoline
// invokes. It catches any accidental throw (subcommands are contracted
// not to throw) and translates to exit code 3.

import { parseArgs, type ParsedArgs } from './parse-args.ts';
import { runCommand } from './commands/run.ts';
import { stageCommand } from './commands/stage.ts';
import { queryCommand } from './commands/query.ts';
import { auditCommand } from './commands/audit.ts';
import { initCommand } from './commands/init.ts';

// ---------------------------------------------------------------------------
// Top-level USAGE.
// ---------------------------------------------------------------------------

export const USAGE = `gdd-sdk <command> [flags]

Commands:
  run              Run the full design pipeline headlessly.
  stage <name>     Run a single stage (brief|explore|plan|design|verify|discuss).
  query <op>       Typed STATE.md read operations.
  audit            Probe connections + dry-run verify.
  init             Bootstrap a new project.

Use 'gdd-sdk <command> -h' for command-specific flags.

Exit codes (general):
  0  success
  1  halted / regression / already-initialized
  2  awaiting-gate / partial (init)
  3  argument / config error
`;

// ---------------------------------------------------------------------------
// Deps.
// ---------------------------------------------------------------------------

export interface DispatcherDeps {
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  readonly commands?: {
    readonly run?: typeof runCommand;
    readonly stage?: typeof stageCommand;
    readonly query?: typeof queryCommand;
    readonly audit?: typeof auditCommand;
    readonly init?: typeof initCommand;
  };
}

// ---------------------------------------------------------------------------
// Dispatcher.
// ---------------------------------------------------------------------------

/**
 * Dispatch a parsed ParsedArgs to the appropriate subcommand. Exported
 * for tests (they can construct a ParsedArgs manually and assert the
 * exit code + captured stdout/stderr).
 */
export async function dispatch(
  parsed: ParsedArgs,
  deps: DispatcherDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const commands = {
    run: deps.commands?.run ?? runCommand,
    stage: deps.commands?.stage ?? stageCommand,
    query: deps.commands?.query ?? queryCommand,
    audit: deps.commands?.audit ?? auditCommand,
    init: deps.commands?.init ?? initCommand,
  };

  // Bare invocation or top-level help → USAGE.
  if (parsed.subcommand === null) {
    stdout.write(USAGE);
    return 0;
  }
  if (
    (parsed.flags['help'] === true || parsed.flags['h'] === true) &&
    // Top-level --help (no subcommand recognized yet; --help before the
    // first positional lands here). Subcommands also honor --help
    // themselves, so this branch only fires for `gdd-sdk --help`.
    parsed.positionals.length === 0 &&
    !KNOWN_SUBCOMMANDS.has(parsed.subcommand)
  ) {
    stdout.write(USAGE);
    return 0;
  }

  switch (parsed.subcommand) {
    case 'run':
      return await commands.run(parsed, { stdout, stderr });
    case 'stage':
      return await commands.stage(parsed, { stdout, stderr });
    case 'query':
      return await commands.query(parsed, { stdout, stderr });
    case 'audit':
      return await commands.audit(parsed, { stdout, stderr });
    case 'init':
      return await commands.init(parsed, { stdout, stderr });
    default:
      stderr.write(
        `gdd-sdk: unknown subcommand "${parsed.subcommand}"\n${USAGE}`,
      );
      return 3;
  }
}

const KNOWN_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'run',
  'stage',
  'query',
  'audit',
  'init',
]);

// ---------------------------------------------------------------------------
// Bootstrap entry point — called by bin/gdd-sdk trampoline.
// ---------------------------------------------------------------------------

/**
 * Top-level main. Parses process.argv.slice(2), dispatches, prints
 * USAGE + exit 3 on any uncaught error. Exported so tests can invoke
 * it directly (bypassing the trampoline).
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  deps: DispatcherDeps = {},
): Promise<number> {
  const parsed = parseArgs(argv);
  return await dispatch(parsed, deps);
}

// ---------------------------------------------------------------------------
// When executed directly by the trampoline, invoke main() + exit.
// ---------------------------------------------------------------------------

// Only self-invoke when this module IS the entry point. We detect that
// by checking process.argv[1] (trampoline passes this file's path).
//
// `import.meta.url` is the POSIX idiom but this TS runs under --experimental-strip-types
// as Node16 modules — we use process.argv to stay ESM/CJS-agnostic.

const entryPath: string = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entryPath.endsWith('/scripts/lib/cli/index.ts')) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // eslint-disable-next-line no-console
      console.error('gdd-sdk: unexpected error:', err);
      process.exit(3);
    },
  );
}
