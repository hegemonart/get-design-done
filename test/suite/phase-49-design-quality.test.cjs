'use strict';
// Phase 49 (Quick Anti-Slop Floor) — the design-quality regex hook. Asserts that the
// advisory PostToolUse hook gdd-design-quality-check.js flags the loud default-AI tells
// (gradient spam, generic CTA, the Inter default, the purple/violet palette, glassmorphism,
// undraw clip art, centered-everything, ambient motion) on a front-end write, leaves a
// hand-designed snippet clean, skips non-front-end files, always emits {continue:true}, and
// appends a design_quality_warn event to the event-chain log. Also asserts hooks.json
// registers the hook on a Write|Edit|MultiEdit matcher and the visual-tells catalog names the
// eight rule categories.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { REPO_ROOT } = require('./helpers.ts');

const HOOK_JS = path.join(REPO_ROOT, 'hooks', 'gdd-design-quality-check.js');
const HOOKS_JSON = path.join(REPO_ROOT, 'hooks', 'hooks.json');
const CATALOG = path.join(REPO_ROOT, 'reference', 'visual-tells.md');

// An adversarial AI-template hero: >=3 gradients, "Get Started", font-inter, purple-600,
// glassmorphism, undraw, centered everything, ambient motion. Should trip many categories.
const SLOP_SNIPPET = `
export default function Hero() {
  return (
    <section className="font-inter min-h-screen bg-gradient-to-br from-purple-600 to-violet-600">
      <div className="mx-auto text-center max-w-3xl backdrop-blur-lg bg-white/10">
        <span className="animate-bounce inline-block">v2</span>
        <h1 className="text-center">Welcome to Acme</h1>
        <p className="mx-auto text-center">Lorem ipsum dolor sit amet.</p>
        <button className="bg-violet-600 backdrop-blur">Get Started</button>
        <a href="#" className="text-center">Learn More</a>
        <img src="/illustrations/undraw_dashboard.svg" alt="" />
        <div className="bg-gradient-to-r from-purple-500" />
        <div className="bg-gradient-to-tr backdrop-blur-md bg-white/20" />
      </div>
    </section>
  );
}
`;

// A hand-designed snippet: tokenized colors, a custom font token alongside Inter, specific
// copy, motion only on a skeleton, a real screenshot. Should trip zero rules.
const CLEAN_SNIPPET = `
export default function Hero() {
  return (
    <section className="font-display bg-primary text-foreground" style={{ fontFamily: 'Inter, var(--font-display)' }}>
      <div className="max-w-3xl">
        <h1 className="text-left">Ship your first design audit in ten minutes</h1>
        <p className="text-left">Run the regex floor on every front-end write and catch the loud tells.</p>
        <button className="bg-primary">Start a free audit</button>
        <img src="/screenshots/audit-report.png" alt="The audit report view" />
        <div className="animate-pulse skeleton" aria-hidden="true" />
      </div>
    </section>
  );
}
`;

function postPayload(filename, content, toolName = 'Write', cwd = os.tmpdir()) {
  return {
    tool_name: toolName,
    tool_input: { file_path: filename, content },
    cwd,
  };
}

test('phase-49-design-quality: hook exists and exports evaluate() and main()', () => {
  assert.ok(fs.existsSync(HOOK_JS), 'hooks/gdd-design-quality-check.js must exist');
  const hook = require(HOOK_JS);
  assert.equal(typeof hook.evaluate, 'function', 'must export evaluate()');
  assert.equal(typeof hook.main, 'function', 'must export main()');
});

test('phase-49-design-quality: adversarial AI-template snippet trips >=3 warnings across distinct categories', () => {
  const hook = require(HOOK_JS);
  const { warnings, count } = hook.evaluate(SLOP_SNIPPET, 'Hero.tsx');
  assert.ok(count >= 3, `expected >=3 warnings, got ${count}`);
  const categories = new Set(warnings.map((w) => w.category));
  assert.ok(categories.size >= 3, `expected >=3 distinct categories, got ${categories.size}: ${[...categories].join(', ')}`);
  // Spot-check the loud ones are present.
  const rules = new Set(warnings.map((w) => w.rule));
  for (const expected of ['gradient-spam', 'generic-cta', 'purple-violet-default']) {
    assert.ok(rules.has(expected), `expected the ${expected} rule to fire`);
  }
  // Every warning carries a line and a category drawn from the catalog vocabulary.
  for (const w of warnings) {
    assert.equal(typeof w.line, 'number', 'each warning has a line number');
    assert.ok(w.category && typeof w.category === 'string', 'each warning has a category');
  }
});

test('phase-49-design-quality: hand-designed snippet trips zero warnings', () => {
  const hook = require(HOOK_JS);
  const { warnings, count } = hook.evaluate(CLEAN_SNIPPET, 'Hero.tsx');
  assert.equal(count, 0, `clean snippet must be silent, got: ${JSON.stringify(warnings)}`);
});

test('phase-49-design-quality: non-front-end files (.md / .ts) are skipped by main()', () => {
  const hook = require(HOOK_JS);
  for (const fname of ['README.md', 'util.ts', 'styles.css']) {
    const decision = hook.main(postPayload(fname, SLOP_SNIPPET));
    assert.deepEqual(decision, { continue: true }, `${fname} must be skipped (bare continue)`);
  }
});

test('phase-49-design-quality: main() always returns {continue:true} (advisory, never blocks)', () => {
  const hook = require(HOOK_JS);
  // Front-end file with slop: still continues, with an advisory note.
  const flagged = hook.main(postPayload('Hero.tsx', SLOP_SNIPPET));
  assert.equal(flagged.continue, true, 'must continue even when warnings exist');
  assert.ok(flagged.systemMessage, 'must surface an advisory note when warnings exist');
  // Front-end file with clean content: bare continue.
  const clean = hook.main(postPayload('Hero.tsx', CLEAN_SNIPPET));
  assert.deepEqual(clean, { continue: true }, 'clean front-end file is a bare continue');
  // Garbage payloads: still continue.
  for (const p of [null, undefined, {}, { tool_name: 'Bash' }]) {
    assert.deepEqual(hook.main(p), { continue: true }, 'garbage payload must continue');
  }
});

test('phase-49-design-quality: emits a design_quality_warn record to a temp event log', () => {
  const hook = require(HOOK_JS);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-dq-'));
  try {
    const decision = hook.main(postPayload('Hero.tsx', SLOP_SNIPPET, 'Write', tmp));
    assert.equal(decision.continue, true);
    const logPath = path.join(tmp, '.design', 'gep', 'events.jsonl');
    assert.ok(fs.existsSync(logPath), 'event-chain log must be written under the injected baseDir');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 1, 'at least one event row');
    const row = JSON.parse(lines[lines.length - 1]);
    assert.equal(row.event, 'design_quality_warn', 'event field must be design_quality_warn');
    assert.equal(row.agent, 'gdd-design-quality-check', 'agent field set');
    assert.ok(row.warning_count >= 3, 'warning_count recorded');
    assert.ok(Array.isArray(row.categories) && row.categories.length >= 1, 'categories recorded');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('phase-49-design-quality: Edit and MultiEdit payload shapes are scanned', () => {
  const hook = require(HOOK_JS);
  const editDecision = hook.main({
    tool_name: 'Edit',
    tool_input: { file_path: 'Hero.tsx', new_string: SLOP_SNIPPET },
    cwd: os.tmpdir(),
  });
  assert.ok(editDecision.systemMessage, 'Edit new_string must be scanned');

  const multiDecision = hook.main({
    tool_name: 'MultiEdit',
    tool_input: { file_path: 'Hero.vue', edits: [{ new_string: SLOP_SNIPPET }] },
    cwd: os.tmpdir(),
  });
  assert.ok(multiDecision.systemMessage, 'MultiEdit edits[].new_string must be scanned');
});

test('phase-49-design-quality: hooks.json registers the hook on a Write|Edit|MultiEdit PostToolUse matcher', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const post = hooks.hooks && hooks.hooks.PostToolUse;
  assert.ok(Array.isArray(post), 'hooks.json must have a PostToolUse array');
  const entry = post.find((e) =>
    JSON.stringify(e.hooks || []).includes('gdd-design-quality-check.js'),
  );
  assert.ok(entry, 'PostToolUse must register hooks/gdd-design-quality-check.js');
  assert.ok(
    /Write/.test(entry.matcher) && /Edit/.test(entry.matcher) && /MultiEdit/.test(entry.matcher),
    `matcher must cover Write|Edit|MultiEdit, got: ${entry.matcher}`,
  );
});

test('phase-49-design-quality: visual-tells catalog names all eight rule categories', () => {
  const hook = require(HOOK_JS);
  const catalog = fs.readFileSync(CATALOG, 'utf8');
  const categories = new Set(hook.RULES.map((r) => r.category));
  for (const cat of categories) {
    assert.match(catalog, new RegExp(`##\\s+${cat}\\b`), `catalog must have a "## ${cat}" heading`);
  }
  // The eight expected category names, exactly.
  for (const cat of [
    'default-AI-hero',
    'gradient-spam',
    'isometric-illustration-fallback',
    'centered-everything-syndrome',
    'inter-everything',
    'purple-violet-default',
    'glassmorphism-spam',
    'decorative-motion-without-intent',
  ]) {
    assert.match(catalog, new RegExp(`##\\s+${cat}\\b`), `missing category section: ${cat}`);
  }
});
