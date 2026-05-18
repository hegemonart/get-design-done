'use strict';
/**
 * tests/decision-injector-context-md.test.cjs
 *
 * Phase 28.5 plan 08 — exercises the gdd-decision-injector hook's CONTEXT.md +
 * ADR additive-context paths.
 *
 * Contract:
 *   - When ./CONTEXT.md exists and contains a term whose name or alias matches the
 *     opened file's basename/path tokens, the hook emits an additionalContext block
 *     including that term + definition.
 *   - When docs/adr/NNNN-*.md files exist and any of their titles matches the opened
 *     file's tokens, the hook includes the ADR title + path.
 *   - When CONTEXT.md is absent, the hook degrades gracefully (no crash, valid JSON).
 *   - When docs/adr/ is absent, the hook degrades gracefully.
 *   - Malformed CONTEXT.md does NOT crash the hook.
 *
 * Tests use ephemeral tmpdirs; cleanup is OS-handled.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '..', 'hooks', 'gdd-decision-injector.js');

function makeCwd() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'di-ctx-')));
  // Create a reference file >= MIN_BYTES (1500) so the hook's matcher engages.
  fs.mkdirSync(path.join(d, 'reference'), { recursive: true });
  fs.writeFileSync(path.join(d, 'reference', 'heuristics.md'), 'x'.repeat(2000));
  // Seed STATE.md so findSearchSources returns >=1 source.
  fs.mkdirSync(path.join(d, '.design'), { recursive: true });
  fs.writeFileSync(
    path.join(d, '.design', 'STATE.md'),
    '---\npipeline_state_version: 1.0\n---\n# STATE\n'
  );
  return d;
}

function runHook(cwd, filePath) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd,
    input: JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: path.join(cwd, filePath) },
      cwd,
    }),
    encoding: 'utf8',
    env: { ...process.env, PWD: cwd },
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* parse error reported via assertion */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, parsed };
}

test('hook emits valid JSON when CONTEXT.md missing (graceful degradation)', () => {
  const cwd = makeCwd();
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON');
  assert.equal(r.parsed.continue, true);
});

test('hook injects CONTEXT.md term when basename matches', () => {
  const cwd = makeCwd();
  fs.writeFileSync(
    path.join(cwd, 'CONTEXT.md'),
    `# Project Glossary

## Heuristics

The mental shortcuts the system uses to triage candidate fixes during audit and verify.

**First seen:** v1.28.5
**Aliases:** [shortcuts, mental-models]
`
  );
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON');
  assert.equal(r.parsed.continue, true);
  // When the hook surfaces a glossary block it puts it under additionalContext.
  const ctx = r.parsed.hookSpecificOutput?.additionalContext || '';
  assert.ok(/Heuristics|CONTEXT\.md|glossary/i.test(ctx), `expected glossary mention in additionalContext; got:\n${ctx}`);
});

test('hook injects matching ADR by title token', () => {
  const cwd = makeCwd();
  fs.mkdirSync(path.join(cwd, 'docs', 'adr'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'docs', 'adr', '0001-adopt-heuristics-engine.md'),
    `---
title: Adopt heuristics engine
status: Accepted
date: 2026-05-18
---

# Adopt heuristics engine

## Context
The heuristics engine triages candidate fixes during audit and verify.

## Decision
Adopt the engine across all audit-family agents.
`
  );
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON');
  assert.equal(r.parsed.continue, true);
  const ctx = r.parsed.hookSpecificOutput?.additionalContext || '';
  assert.ok(/ADR|adr|Adopt heuristics/i.test(ctx), `expected ADR mention in additionalContext; got:\n${ctx}`);
});

test('hook injects glossary term when alias matches', () => {
  const cwd = makeCwd();
  // Term name "Materialization cascade" but alias "heuristics" matches the file.
  fs.writeFileSync(
    path.join(cwd, 'CONTEXT.md'),
    `# Project Glossary

## Materialization cascade

The chain of steps that turns a sketch into a real deployable artifact.

**Aliases:** [heuristics, making-real, "real-ification"]
`
  );
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON');
  const ctx = r.parsed.hookSpecificOutput?.additionalContext || '';
  // Either the canonical term or the glossary heading should appear.
  assert.ok(
    /Materialization cascade|glossary|CONTEXT\.md/i.test(ctx),
    `expected alias-matched glossary term in additionalContext; got:\n${ctx}`
  );
});

test('hook handles malformed CONTEXT.md without crash', () => {
  const cwd = makeCwd();
  fs.writeFileSync(path.join(cwd, 'CONTEXT.md'), '{{{ malformed\n### no-h2-here\nrandom bytes\x00\x01');
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON even with malformed CONTEXT.md');
  assert.equal(r.parsed.continue, true);
});

test('hook handles malformed ADR without crash', () => {
  const cwd = makeCwd();
  fs.mkdirSync(path.join(cwd, 'docs', 'adr'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs', 'adr', '0001-malformed.md'), '\x00\x01garbage no frontmatter no title');
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON');
});

test('hook is idempotent: same input -> same output', () => {
  const cwd = makeCwd();
  fs.writeFileSync(
    path.join(cwd, 'CONTEXT.md'),
    `# Glossary

## Heuristics

A definition.

**Aliases:** [shortcut]
`
  );
  const r1 = runHook(cwd, 'reference/heuristics.md');
  const r2 = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r1.code, 0);
  assert.equal(r2.code, 0);
  assert.equal(r1.stdout, r2.stdout, 'idempotency: identical input must yield identical stdout');
});

test('hook does not crash when docs/adr/ exists but is empty', () => {
  const cwd = makeCwd();
  fs.mkdirSync(path.join(cwd, 'docs', 'adr'), { recursive: true });
  const r = runHook(cwd, 'reference/heuristics.md');
  assert.equal(r.code, 0, `stderr=${r.stderr}`);
  assert.ok(r.parsed, 'hook must emit valid JSON');
});

test('hook module loads cleanly (no parse errors)', () => {
  // Use a child process to avoid polluting the parent's require cache.
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(HOOK)}); process.exit(0);`], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `hook module failed to load: stderr=${r.stderr}`);
});
