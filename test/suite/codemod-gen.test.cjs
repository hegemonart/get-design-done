'use strict';
// Phase 39.1 — codemod-gen unit test. Verifies the pure codemod template generator
// (scripts/lib/migration/codemod-gen.cjs): a jscodeshift/ast-grep template per rule kind,
// deterministic, dep-free, proposal-only (emits text — never runs a codemod). Every test `39.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/migration/codemod-gen.cjs');
const { emitCodemod, KINDS } = require(MOD);

test('39.1-03: exposes the 5 rule kinds', () => {
  assert.deepEqual(KINDS, ['rename-class', 'rename-prop', 'remove-component', 'token-rename', 'new-default']);
});

test('39.1-03: rename-prop → jscodeshift JSXAttribute rename', () => {
  const r = emitCodemod({ id: 'MUI6-01', kind: 'rename-prop', from: 'item', to: 'size' });
  assert.equal(r.ruleId, 'MUI6-01');
  assert.equal(r.engine, 'jscodeshift');
  assert.match(r.template, /JSXAttribute/);
  assert.match(r.template, /'item'/);
  assert.match(r.template, /'size'/);
  assert.match(r.template, /MUI6-01/, 'template carries the rule id');
});

test('39.1-03: rename-class + token-rename → bounded regex replace', () => {
  const c = emitCodemod({ id: 'TW4-02', kind: 'rename-class', from: 'shadow-sm', to: 'shadow-xs' });
  assert.match(c.template, /shadow-sm/);
  assert.match(c.template, /shadow-xs/);
  const t = emitCodemod({ id: 'MD-01', kind: 'token-rename', from: '--mdc-theme-primary', to: '--md-sys-color-primary' });
  assert.match(t.template, /mdc-theme-primary/);
  assert.match(t.template, /md-sys-color-primary/);
});

test('39.1-03: remove-component flags a TODO; new-default is a manual advisory (no transform)', () => {
  const rm = emitCodemod({ id: 'SH-09', kind: 'remove-component', from: 'Toast', to: 'Sonner' });
  assert.match(rm.template, /TODO\(SH-09\)/);
  const nd = emitCodemod({ id: 'TW4-09', kind: 'new-default', from: 'border-gray-200', to: 'currentColor', note: 'border color changed' });
  assert.match(nd.template, /NO automatic transform/i);
  assert.match(nd.template, /border color changed/);
});

test('39.1-03: ast-grep engine emits a YAML rule with fix', () => {
  const ag = emitCodemod({ id: 'MUI6-01', kind: 'rename-prop', from: 'item', to: 'size' }, { engine: 'ast-grep' });
  assert.equal(ag.engine, 'ast-grep');
  assert.match(ag.template, /language: tsx/);
  assert.match(ag.template, /fix: size=\$VAL/);
});

test('39.1-03: deterministic + guards bad input', () => {
  const a = emitCodemod({ id: 'X', kind: 'rename-prop', from: 'a', to: 'b' });
  const b = emitCodemod({ id: 'X', kind: 'rename-prop', from: 'a', to: 'b' });
  assert.equal(a.template, b.template);
  assert.throws(() => emitCodemod({ id: 'X', kind: 'bogus' }), /invalid kind/);
  assert.throws(() => emitCodemod(null), /rule object required/);
  assert.throws(() => emitCodemod({ id: 'X', kind: 'rename-prop' }, { engine: 'sed' }), /jscodeshift\|ast-grep/);
});

test('39.1-03: pure + dep-free (zero require — never imports jscodeshift/ast-grep)', () => {
  const src = fs.readFileSync(MOD, 'utf8');
  assert.doesNotMatch(src, /\brequire\s*\(/, 'codemod-gen.cjs must not require anything');
  assert.doesNotMatch(src, /jscodeshift'\)|@ast-grep/, 'must not import the codemod engines');
});
