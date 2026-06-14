#!/usr/bin/env -S node --experimental-strip-types
// scripts/cli/hone-events.mjs — CLI transport for the event stream
// (Plan 22-06).
//
// Subcommands:
//   hone-events tail [--follow] [--path=<p>]
//     - dump events.jsonl to stdout, line-by-line
//     - --follow re-polls every 250ms appending new content (no native
//       inotify dep; portable across platforms)
//
//   hone-events grep <filter> [--path=<p>]
//     - filter language (space-separated terms, all AND'd):
//         type=<exact-string>           — match `type` field
//         payload.<dotted.path>=<value> — drill into payload by '.'-path
//         !type=<exact-string>          — negate
//         !payload.<path>=<value>       — negate
//     - prints matching events to stdout as JSONL (compact)
//
//   hone-events cat [--path=<p>]
//     - alias for tail without --follow, but pretty-prints with a
//       leading timestamp+type prefix per line
//
//   hone-events list-types
//     - prints the runtime KNOWN_EVENT_TYPES list (from Plan 22-01)
//
//   hone-events serve [--port=<n>] [--token=<t>] [--tail=<file>]
//     - WebSocket transport (Plan 22-07). Loaded lazily via
//       probe-optional; helpful error if `ws` is not installed.
//
// Default --path is `.design/telemetry/events.jsonl` (relative to cwd).

import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { argv, exit, stdout, stderr } from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DEFAULT_PATH = '.design/telemetry/events.jsonl';

function usage() {
  stderr.write(
    [
      'hone-events — Phase 22 event-stream CLI',
      '',
      'Usage:',
      '  hone-events tail [--follow] [--path=<p>]',
      '  hone-events grep <filter…> [--path=<p>]',
      '  hone-events cat [--path=<p>]',
      '  hone-events list-types',
      '  hone-events serve [--port=<n>] [--token=<t>] [--tail=<file>]',
      '  gdd-events --type <typename> [--path=<p>]   (Plan 29-03 ergonomic alias for `grep type=<typename>`)',
      '',
      'Filter language (grep): type=<s>  payload.<dotted.path>=<s>  !type=<s>',
      '',
    ].join('\n'),
  );
}

function parseArgs(args) {
  const out = { _: [], flags: {} };
  // Flags that take a value via the space-separated form `--flag <value>`.
  // Without this set, `--type capability_gap` would be parsed as
  // { flags: { type: true } } and the value would land in positional args.
  const VALUE_FLAGS = new Set(['type', 'path', 'port', 'token', 'tail']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) {
        const name = a.slice(2);
        if (VALUE_FLAGS.has(name) && i + 1 < args.length && !args[i + 1].startsWith('--')) {
          out.flags[name] = args[i + 1];
          i += 1;
        } else {
          out.flags[name] = true;
        }
      } else {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function resolvePath(flagPath) {
  const raw = flagPath || DEFAULT_PATH;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

/** Compile filter terms like "type=foo", "!payload.x=1" into a predicate. */
export function compileFilter(terms) {
  /** @type {Array<(ev: any) => boolean>} */
  const checks = [];
  for (const term of terms) {
    let negate = false;
    let body = term;
    if (body.startsWith('!')) {
      negate = true;
      body = body.slice(1);
    }
    const eq = body.indexOf('=');
    if (eq === -1) {
      throw new Error(`hone-events: bad filter term: ${term}`);
    }
    const key = body.slice(0, eq);
    const want = body.slice(eq + 1);
    /** @type {(ev: any) => boolean} */
    let test;
    if (key === 'type') {
      test = (ev) => ev?.type === want;
    } else if (key.startsWith('payload.')) {
      const path = key.slice('payload.'.length).split('.');
      test = (ev) => {
        let cur = ev?.payload;
        for (const part of path) {
          if (cur == null || typeof cur !== 'object') return false;
          cur = cur[part];
        }
        return String(cur) === want;
      };
    } else if (key === 'stage') {
      test = (ev) => ev?.stage === want;
    } else if (key === 'cycle') {
      test = (ev) => ev?.cycle === want;
    } else if (key === 'sessionId') {
      test = (ev) => ev?.sessionId === want;
    } else {
      throw new Error(`hone-events: unsupported filter key: ${key}`);
    }
    checks.push(negate ? (ev) => !test(ev) : test);
  }
  return (ev) => checks.every((c) => c(ev));
}

async function cmdTail(parsed) {
  const path = resolvePath(parsed.flags.path);
  const { readEvents } = await import('../../sdk/event-stream/reader.ts');
  if (!parsed.flags.follow) {
    for await (const ev of readEvents({ path })) {
      stdout.write(JSON.stringify(ev) + '\n');
    }
    return 0;
  }
  // Follow mode: stream existing content, then poll for appends.
  let offset = 0;
  if (existsSync(path)) {
    for await (const ev of readEvents({ path })) {
      stdout.write(JSON.stringify(ev) + '\n');
    }
    offset = statSync(path).size;
  }
  // Poll loop. Reads new bytes since last offset, splits on \n, writes each.
  let buf = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, 250));
    if (!existsSync(path)) continue;
    const size = statSync(path).size;
    if (size <= offset) continue;
    const fd = openSync(path, 'r');
    try {
      const need = size - offset;
      const chunk = Buffer.allocUnsafe(need);
      const n = readSync(fd, chunk, 0, need, offset);
      offset += n;
      buf += chunk.subarray(0, n).toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        stdout.write(line + '\n');
      }
    } finally {
      closeSync(fd);
    }
  }
}

async function cmdGrep(parsed) {
  const path = resolvePath(parsed.flags.path);
  const terms = parsed._;
  if (terms.length === 0) {
    stderr.write('hone-events grep: at least one filter term required\n');
    return 2;
  }
  const predicate = compileFilter(terms);
  const { readEvents } = await import('../../sdk/event-stream/reader.ts');
  for await (const ev of readEvents({ path, predicate })) {
    stdout.write(JSON.stringify(ev) + '\n');
  }
  return 0;
}

async function cmdCat(parsed) {
  const path = resolvePath(parsed.flags.path);
  const { readEvents } = await import('../../sdk/event-stream/reader.ts');
  for await (const ev of readEvents({ path })) {
    const ts = ev.timestamp ?? '?';
    const tp = ev.type ?? '?';
    stdout.write(`${ts}  ${tp.padEnd(28)}  ${JSON.stringify(ev.payload ?? {})}\n`);
  }
  return 0;
}

async function cmdListTypes() {
  const { KNOWN_EVENT_TYPES } = await import('../../sdk/event-stream/types.ts');
  for (const t of KNOWN_EVENT_TYPES) stdout.write(t + '\n');
  return 0;
}

async function cmdServe(parsed) {
  let mod;
  try {
    mod = require('../lib/transports/ws.cjs');
  } catch (err) {
    stderr.write(
      'hone-events serve: WebSocket transport requires the optional `ws` package.\n' +
        '  install: npm i -D ws\n' +
        `  ${err && err.message ? err.message : String(err)}\n`,
    );
    return 1;
  }
  const port = Number(parsed.flags.port) || 9595;
  const token = parsed.flags.token || process.env.GDD_EVENTS_TOKEN;
  if (!token) {
    stderr.write('hone-events serve: --token=<t> or GDD_EVENTS_TOKEN env required\n');
    return 2;
  }
  const tailFrom = parsed.flags.tail
    ? resolvePath(parsed.flags.tail)
    : resolvePath(undefined);
  // Bridge live bus → ws transport. The transport is CommonJS and cannot
  // require .ts directly, so we import the bus here and pass subscribeAll
  // as a callback factory.
  const { subscribeAll } = await import('../../sdk/event-stream/index.ts');
  const subscribe = (handler) => subscribeAll(handler);
  const handle = await mod.startServer({ port, token, tailFrom, subscribe });
  stderr.write(`hone-events: WebSocket listening on :${port} (auth required)\n`);
  // Keep the process alive until SIGINT/SIGTERM.
  await new Promise((resolve) => {
    const close = () => {
      handle.close();
      resolve();
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
  return 0;
}

async function main() {
  const parsed = parseArgs(argv.slice(2));

  // Plan 29-03: `--type <typename>` (and `--type=<typename>`) is an ergonomic
  // alias for `grep type=<typename>`. Desugar BEFORE shifting the subcommand
  // so the flag can be used without a subcommand prefix:
  //   hone-events --type capability_gap --path=…
  // Equivalent to:
  //   hone-events grep type=capability_gap --path=…
  if (typeof parsed.flags.type === 'string' && parsed.flags.type.length > 0) {
    const typeValue = parsed.flags.type;
    delete parsed.flags.type;
    // Inject the filter term and force the grep code path. Preserve any
    // additional positional terms the user already supplied.
    parsed._ = [`type=${typeValue}`, ...parsed._];
    try {
      return await cmdGrep(parsed);
    } catch (err) {
      stderr.write(`hone-events: ${err && err.message ? err.message : String(err)}\n`);
      return 1;
    }
  }

  const sub = parsed._.shift();
  try {
    switch (sub) {
      case 'tail':
        return await cmdTail(parsed);
      case 'grep':
        return await cmdGrep(parsed);
      case 'cat':
        return await cmdCat(parsed);
      case 'list-types':
        return await cmdListTypes();
      case 'serve':
        return await cmdServe(parsed);
      case '-h':
      case '--help':
      case 'help':
        usage();
        return 0;
      default:
        usage();
        return sub === undefined ? 0 : 2;
    }
  } catch (err) {
    stderr.write(`hone-events: ${err && err.message ? err.message : String(err)}\n`);
    return 1;
  }
}

// Compare module URL via pathToFileURL — Windows paths use backslashes
// and need proper file:// URL canonicalisation; the simpler `file://${argv[1]}`
// form drops to false on Windows and the CLI silently no-ops.
const isCli = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().then((code) => exit(code), (err) => {
    stderr.write(`hone-events fatal: ${err}\n`);
    exit(1);
  });
}
