// scripts/lib/context-engine/index.ts — public API for the context-engine.
// Pipes { stage, cwd } → typed ContextBundle. Never touches the Agent SDK.

import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';

import type { Stage, ContextFile, ContextBundle, BundleOptions } from './types.ts';
import { MANIFEST, manifestFor, readFileRaw } from './manifest.ts';
import { truncateMarkdown } from './truncate.ts';

/** Default 8 KiB truncation threshold. */
const DEFAULT_THRESHOLD_BYTES = 8192;

export type { Stage, ContextFile, ContextBundle, BundleOptions } from './types.ts';
export { MANIFEST, manifestFor, readFileRaw } from './manifest.ts';
export { truncateMarkdown } from './truncate.ts';

/**
 * Build the context bundle for a given stage. Reads every file in
 * `MANIFEST[stage]` from disk, applies markdown-aware truncation to any file
 * whose raw size exceeds `truncationThresholdBytes` (default 8 KiB), and
 * returns the typed bundle.
 *
 * Missing files are recorded as `present: false` with empty content (unless
 * `strict: true`, in which case the first missing file throws). ENOENT never
 * surfaces to the caller in default mode — other IO errors still propagate.
 */
export function buildContextBundle(stage: Stage, opts: BundleOptions = {}): ContextBundle {
  const cwd = opts.cwd ?? process.cwd();
  const threshold = opts.truncationThresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  const strict = opts.strict === true;

  const manifest = manifestFor(stage);
  const files: ContextFile[] = [];
  let total_bytes = 0;

  for (const entry of manifest) {
    const absPath = resolve(cwd, entry);
    const { present, raw, raw_bytes } = readFileRaw(absPath);

    if (!present) {
      if (strict) {
        throw new Error(`context-engine: required file not found: ${entry}`);
      }
      files.push({
        path: entry,
        present: false,
        raw_bytes: 0,
        content: '',
        content_bytes: 0,
        truncated_lines: 0,
      });
      continue;
    }

    const { content, truncated_lines } = truncateMarkdown(raw, threshold);
    const content_bytes = Buffer.byteLength(content, 'utf8');
    files.push({
      path: entry,
      present: true,
      raw_bytes,
      content,
      content_bytes,
      truncated_lines,
    });
    total_bytes += content_bytes;
  }

  return {
    stage,
    files,
    total_bytes,
    built_at: new Date().toISOString(),
  };
}

/**
 * Render a bundle as a single prompt-ready string with per-file HTML-comment
 * headers and `\n---\n` dividers between files. Missing files render as
 * `<!-- file: PATH (missing) -->` with no body.
 *
 * Consumed by pipeline-runner (21-05) and parallel runners (21-06..08) to
 * build the system prompt's context section.
 */
export function renderBundle(bundle: ContextBundle): string {
  const parts: string[] = [];
  for (const f of bundle.files) {
    if (!f.present) {
      parts.push(`<!-- file: ${f.path} (missing) -->`);
      continue;
    }
    parts.push(`<!-- file: ${f.path} (${f.content_bytes} bytes) -->\n${f.content}`);
  }
  // Ensure MANIFEST import remains live-referenced for consumers that depend
  // on side-effects of module loading (none currently, but harmless).
  void MANIFEST;
  return parts.join('\n---\n');
}
