#!/usr/bin/env node
/**
 * codegen-schema-types.ts — Generate TypeScript interface declarations from
 * every Draft-07 JSON Schema under `reference/schemas/*.schema.json`.
 *
 * Output: `reference/schemas/generated.d.ts` — single file containing one
 * `export interface XSchema` per schema, named from the filename stem.
 *
 * Invoked: `npm run codegen:schemas` (requires repo-root cwd, which npm sets
 * automatically). If invoked directly, `--repo-root <path>` can override.
 *
 * --check : no writes; regenerate in-memory and diff against the committed
 *   reference/schemas/generated.d.ts. Exit 1 on any byte drift, 0 when in
 *   sync. This is the CI drift gate (mirrors scripts/build-skills.cjs --check).
 *
 * Exit codes:
 *   0 - success / in sync
 *   1 - any read/parse/compile failure, or drift in --check mode
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { compile } from 'json-schema-to-typescript';

/**
 * Resolve the repo root. Priority:
 *   1. `--repo-root <path>` CLI arg.
 *   2. `process.cwd()` — npm scripts run from the package root, so this is
 *      the common case.
 *
 * We deliberately avoid `import.meta.url` / `__dirname` so this module stays
 * valid under both CommonJS type-checking (Node16 + no package "type") and
 * the Node 22+ `--experimental-strip-types` runtime, which auto-detects ESM.
 */
function resolveRepoRoot(): string {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--repo-root');
  if (idx !== -1 && idx + 1 < argv.length) {
    const v = argv[idx + 1];
    if (typeof v === 'string' && v.length > 0) return resolve(v);
  }
  return resolve(process.cwd());
}

const REPO_ROOT = resolveRepoRoot();
const SCHEMA_DIR = join(REPO_ROOT, 'reference', 'schemas');
const OUTPUT_PATH = join(SCHEMA_DIR, 'generated.d.ts');

const HEADER =
  '// AUTO-GENERATED from reference/schemas/*.schema.json — DO NOT EDIT.\n' +
  '// Regenerate: npm run codegen:schemas\n' +
  '/* eslint-disable */\n';

/**
 * Map a schema filename stem (e.g. "authority-snapshot" from
 * "authority-snapshot.schema.json") to the canonical interface name per
 * Plan 20-00: PascalCase + `Schema` suffix. Hyphens split word boundaries.
 */
function stemToInterfaceName(stem: string): string {
  const pascal = stem
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  return `${pascal}Schema`;
}

/**
 * Build the full generated.d.ts content in-memory. Returns the byte-identical
 * string that the default (write) mode persists, so --check can diff against
 * the committed file without touching disk.
 */
async function generate(): Promise<{ content: string; count: number }> {
  const entries = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.schema.json'))
    .sort();

  if (entries.length === 0) {
    console.error(`codegen-schema-types: no *.schema.json files found in ${SCHEMA_DIR}`);
    process.exit(1);
  }

  const chunks: string[] = [HEADER];

  for (const file of entries) {
    const stem = basename(file, '.schema.json');
    const interfaceName = stemToInterfaceName(stem);
    const schemaPath = join(SCHEMA_DIR, file);

    let schema: unknown;
    try {
      schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`codegen-schema-types: failed to parse ${file}: ${msg}`);
      process.exit(1);
    }

    try {
      // compile() expects a JSONSchema; we pass our parsed object.
      // bannerComment: '' — we add our own header once at the top.
      const ts = await compile(schema as Parameters<typeof compile>[0], interfaceName, {
        bannerComment: '',
        additionalProperties: false,
        style: { singleQuote: true, trailingComma: 'all' },
        unreachableDefinitions: false,
      });
      chunks.push(`// ---- ${file} ----\n`);
      // json-schema-to-typescript emits the top-level as the requested name,
      // but when the schema's own `title` differs it may prefix. We rename
      // the top-level export to our canonical name for stability.
      const renamed = ensureExportInterface(ts, interfaceName);
      chunks.push(renamed);
      chunks.push('\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`codegen-schema-types: failed to compile ${file}: ${msg}`);
      process.exit(1);
    }
  }

  return { content: chunks.join(''), count: entries.length };
}

async function main(): Promise<void> {
  const checkMode = process.argv.slice(2).includes('--check');
  const { content, count } = await generate();

  if (checkMode) {
    // Drift gate: compare in-memory output against the committed file. No writes.
    let current: string | null = null;
    try {
      current = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      console.error(
        `codegen-schema-types --check: DRIFT - ${OUTPUT_PATH} is missing (run \`npm run codegen:schemas\` and commit).`,
      );
      process.exit(1);
    }
    // Normalize line endings before comparing. The committed file is stored with
    // LF in git, but on a Windows checkout (core.autocrlf) it materializes as
    // CRLF in the working tree, while the generator always emits LF. Comparing
    // raw bytes would false-positive on every line in any CRLF environment, so
    // the gate must be EOL-agnostic - it tests content drift, not line endings.
    const norm = (s: string): string => s.replace(/\r\n/g, '\n');
    if (norm(current) !== norm(content)) {
      console.error(
        'codegen-schema-types --check: DRIFT detected (run `npm run codegen:schemas` and commit).',
      );
      console.error(`  ${OUTPUT_PATH} does not match codegen output for ${count} schema(s).`);
      process.exit(1);
    }
    console.error(
      `codegen-schema-types --check: OK - generated.d.ts matches codegen output (${count} schema(s)).`,
    );
    return;
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, content, 'utf8');
  console.log(`codegen-schema-types: wrote ${OUTPUT_PATH} (${count} schema(s))`);
}

/**
 * Ensure that the compiled TS output exports an interface/type alias with the
 * exact canonical name. `json-schema-to-typescript` normally emits this
 * already, but some schemas whose `title` field contains non-identifier
 * characters (e.g. ".design/config.json") get their interface named from a
 * cleaned title rather than our requested name. We add an `export` alias at
 * the end so every generated chunk guarantees `export interface XSchema` (or
 * `export type XSchema = ...`) is available.
 */
function ensureExportInterface(ts: string, canonical: string): string {
  const hasCanonical = new RegExp(
    `export\\s+(interface|type)\\s+${canonical}\\b`,
  ).test(ts);
  if (hasCanonical) return ts;

  const firstExport = ts.match(
    /export\s+(interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)/,
  );
  if (!firstExport) {
    return ts + `\nexport type ${canonical} = unknown;\n`;
  }
  const firstName = firstExport[2];
  if (firstName === canonical) return ts;
  return ts + `\nexport type ${canonical} = ${firstName};\n`;
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`codegen-schema-types: ${msg}`);
  process.exit(1);
});
