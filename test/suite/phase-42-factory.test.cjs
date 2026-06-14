'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const factory = require('../../scripts/lib/build/factory.cjs');
const { compile, placeholdersUsed, stripHarnessOnly, PLACEHOLDERS } = factory;

const CLAUDE = { id: 'claude', command_prefix: '/hone:', model: 'M', config_file: 'C', ask_instruction: 'A' };
const CODEX = { id: 'codex', command_prefix: '/hone-', model: 'gpt', config_file: '.codex/config.toml', ask_instruction: 'ask Codex' };

test('42-factory-01: factory.cjs is pure (no require, no fs)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../scripts/lib/build/factory.cjs'), 'utf8');
  assert.equal(/\brequire\s*\(/.test(src), false, 'factory must not require() anything');
  assert.equal(/\bfs\b\s*\./.test(src), false, 'factory must not touch fs');
});

test('42-factory-02: substitutes all four placeholders', () => {
  const t = '{{command_prefix}}audit uses {{model}} via {{config_file}}; {{ask_instruction}}.';
  assert.equal(compile(t, CLAUDE), '/hone:audit uses M via C; A.');
});

test('42-factory-03: codex command_prefix differs from claude', () => {
  const t = 'Run {{command_prefix}}audit';
  assert.equal(compile(t, CLAUDE), 'Run /hone:audit');
  assert.equal(compile(t, CODEX), 'Run /hone-audit');
});

test('42-factory-04: harness-only kept iff id listed', () => {
  const t = 'X<!-- harness-only: cursor,codex -->Y<!-- /harness-only -->Z';
  assert.equal(compile(t, CODEX), 'XYZ');
  assert.equal(compile(t, CLAUDE), 'XZ');
  assert.equal(stripHarnessOnly(t, 'cursor'), 'XYZ');
});

test('42-factory-05: escape \\{{...}} emits a literal placeholder, never substituted', () => {
  const t = 'literal \\{{command_prefix}} and real {{command_prefix}}go';
  assert.equal(compile(t, CLAUDE), 'literal {{command_prefix}} and real /hone:go');
});

test('42-factory-06: byte-identity round-trip — /hone: <-> {{command_prefix}} is a pure inverse', () => {
  const original = 'See /hone:audit, /hone:plan, and /hone:verify. No other tokens.';
  const sourced = original.split('/hone:').join('{{command_prefix}}'); // the migration transform
  assert.equal(compile(sourced, CLAUDE), original, 'Claude compile must reproduce the original byte-for-byte');
});

test('42-factory-07: idempotent / byte-stable on re-compile of substituted output', () => {
  const t = '{{command_prefix}}audit';
  const once = compile(t, CLAUDE);
  assert.equal(compile(once, CLAUDE), once, 'output has no remaining placeholders to change');
});

test('42-factory-08: placeholdersUsed excludes escaped occurrences', () => {
  const used = placeholdersUsed('real {{command_prefix}} and escaped \\{{model}}');
  assert.deepEqual([...used].sort(), ['command_prefix']);
});

test('42-factory-09: PLACEHOLDERS is the canonical four', () => {
  assert.deepEqual(PLACEHOLDERS, ['command_prefix', 'model', 'config_file', 'ask_instruction']);
});

test('42-factory-10: type guards', () => {
  assert.throws(() => compile(123, CLAUDE), TypeError);
  assert.throws(() => compile('x', null), TypeError);
});
