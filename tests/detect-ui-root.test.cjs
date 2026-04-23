'use strict';

const assert = require('node:assert');
const path = require('node:path');
const test = require('node:test');

const detectUiRoot = require('../scripts/lib/detect-ui-root.cjs');

const FIXTURE = (name) =>
  path.resolve(__dirname, '..', 'test-fixture', 'src', 'ui-detection', name);

test('detects Next.js app-router components', () => {
  const r = detectUiRoot(FIXTURE('nextjs-app-router'));
  assert.ok(r);
  assert.strictEqual(r.kind, 'next-app-router');
  assert.strictEqual(r.path, 'app/components');
  assert.strictEqual(r.framework, 'next');
  assert.ok(r.confidence >= 0.8);
});

test('detects Vite src/components', () => {
  const r = detectUiRoot(FIXTURE('vite-src'));
  assert.ok(r);
  assert.strictEqual(r.kind, 'src-components');
  assert.strictEqual(r.path, 'src/components');
  assert.strictEqual(r.framework, 'vite');
});

test('detects CRA src/components', () => {
  const r = detectUiRoot(FIXTURE('cra-root'));
  assert.ok(r);
  assert.strictEqual(r.kind, 'src-components');
  assert.strictEqual(r.framework, 'cra');
});

test('detects Remix app/components with framework=remix', () => {
  const r = detectUiRoot(FIXTURE('remix-routes'));
  assert.ok(r);
  // kind check is loose — app/components matches the next-app-router rule,
  // but the framework field reliably reports "remix" from package.json.
  assert.ok(['next-app-router', 'remix'].includes(r.kind));
  assert.strictEqual(r.framework, 'remix');
  assert.strictEqual(r.path, 'app/components');
});

test('detects monorepo apps/*/components', () => {
  const r = detectUiRoot(FIXTURE('monorepo-apps'));
  assert.ok(r);
  assert.strictEqual(r.kind, 'monorepo-apps');
  assert.strictEqual(r.path, 'apps/web/components');
});

test('detects monorepo packages/ui/src', () => {
  const r = detectUiRoot(FIXTURE('monorepo-ui-pkg'));
  assert.ok(r);
  assert.strictEqual(r.kind, 'monorepo-ui-pkg');
  assert.strictEqual(r.path, 'packages/ui/src');
  assert.strictEqual(r.confidence, 0.95);
});

test('flags backend-only repo without UI surface', () => {
  const r = detectUiRoot(FIXTURE('backend-only'));
  assert.ok(r);
  assert.strictEqual(r.kind, 'backend-only');
  assert.strictEqual(r.path, null);
  assert.strictEqual(r.framework, 'backend');
  assert.match(r.reason, /frontend-only diagnostic/);
});

test('returns null on empty repo (no package.json, no UI dir)', () => {
  const r = detectUiRoot(FIXTURE('empty-repo'));
  assert.strictEqual(r, null);
});
