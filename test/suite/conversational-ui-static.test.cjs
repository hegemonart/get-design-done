'use strict';
// Phase 36.3 — Conversational UI static contract. Verifies the patterns reference exists
// with its two load-bearing sections, is registered, and that design-context-builder gains
// the `conversational` project type (routes to design-executor + loads the reference).
// Hermetic (D-06): file reads only. Every test tagged `36.3-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const REF = read('reference/conversational-ui.md');
const CB = read('agents/design-context-builder.md');

test('36.3-02: conversational-ui reference exists with both load-bearing sections', () => {
  assert.ok(REF.length > 1500, 'substantive');
  assert.match(REF, /^# Conversational UI Design Patterns/m, 'H1 title');
  assert.match(REF, /^## Detection signals$/m, 'Detection signals section');
  assert.match(REF, /^## Audit checklist$/m, 'Audit checklist section');
});

test('36.3-02: detection signals name real chatbot/voice dependencies', () => {
  assert.match(REF, /botpress|dialogflow|actions-on-google|ask-sdk|rasa|botframework/i, 'real deps');
  assert.match(REF, /chatbot|voice|assistant|conversational/i, 'keywords');
});

test('36.3-02: covers the required conversational patterns', () => {
  assert.match(REF, /no-?input|no-?match|reprompt/i, 'voice-flow reprompts');
  assert.match(REF, /multi-?turn|slot|context carry/i, 'multi-turn dialogue');
  assert.match(REF, /prompt-as-UX|persona|system.?prompt/i, 'prompt-as-UX');
  assert.match(REF, /empty.?state|suggested|opener|opening message/i, 'chatbot empty-states');
  assert.match(REF, /onboarding/i, 'voice onboarding');
  assert.match(REF, /error recovery|fallback|dead end/i, 'error recovery');
});

test('36.3-02: registered in registry.json (type heuristic, phase 36.3)', () => {
  const reg = JSON.parse(read('reference/registry.json'));
  const e = reg.entries.find((x) => x.name === 'conversational-ui');
  assert.ok(e, 'conversational-ui registered');
  assert.equal(e.path, 'reference/conversational-ui.md', 'path');
  assert.equal(e.type, 'heuristic', 'type');
  assert.equal(e.phase, 36.3, 'phase');
});

test('36.3-02: design-context-builder gains the conversational project type', () => {
  assert.match(CB, /`conversational`/, 'enum lists conversational');
  assert.match(CB, /7 values/, 'enum bumped to 7');
  assert.match(CB, /\| conversational\b/, 'routing-table row');
  assert.match(CB, /conversational[\s\S]{0,80}design-executor/, 'routes to design-executor');
  assert.match(CB, /reference\/conversational-ui\.md/, 'loads the conversational reference');
});

test('36.3-02: CLI/REPL UX is out of scope this phase (D-03)', () => {
  assert.match(REF, /CLI|REPL|terminal/i, 'mentions the out-of-scope boundary');
});
