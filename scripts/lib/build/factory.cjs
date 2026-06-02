'use strict';
// Phase 42 — pure transformer factory (impeccable-style). compile(text, config) => string.
// Pure: no filesystem, no I/O, no module imports. The orchestrator (scripts/build-skills.cjs)
// does all reading/writing; this layer only transforms a single skill body for one harness config.
//
// Transform order (deterministic):
//   1. harness-only blocks   <!-- harness-only: a,b -->BODY<!-- /harness-only --> kept iff config.id in {a,b}
//   2. protect escapes       \{{ x }}  -> sentinel  (emit literal {{ x }}, never substituted)
//   3. substitute            {{command_prefix}} {{model}} {{config_file}} {{ask_instruction}}
//   4. restore escapes       sentinel -> {{ x }}
//
// D-01: for the Claude config (command_prefix === '/gdd:') this is the exact inverse of the migration
// (/gdd: -> {{command_prefix}}), so compile(source, claude) reproduces skills/ byte-for-byte.

const PLACEHOLDERS = ['command_prefix', 'model', 'config_file', 'ask_instruction'];
const ESCAPE_OPEN = '@@GDD_ESC_';
const ESCAPE_CLOSE = '@@';

function stripHarnessOnly(text, id) {
  const re = /<!--\s*harness-only:\s*([^>]*?)\s*-->([\s\S]*?)<!--\s*\/harness-only\s*-->/g;
  return text.replace(re, (_m, list, body) => {
    const ids = String(list).split(',').map((s) => s.trim()).filter(Boolean);
    return ids.includes(id) ? body : '';
  });
}

function compile(text, config) {
  if (typeof text !== 'string') throw new TypeError('compile: text must be a string');
  if (!config || typeof config !== 'object') throw new TypeError('compile: config object is required');

  let out = stripHarnessOnly(text, config.id);

  // 2. protect \{{ ... }} escapes
  const escapes = [];
  out = out.replace(/\\\{\{([\s\S]*?)\}\}/g, (_m, inner) => {
    escapes.push('{{' + inner + '}}');
    return ESCAPE_OPEN + (escapes.length - 1) + ESCAPE_CLOSE;
  });

  // 3. substitute placeholders
  for (const key of PLACEHOLDERS) {
    if (config[key] == null) continue;
    out = out.split('{{' + key + '}}').join(String(config[key]));
  }

  // 4. restore escapes as literal {{ ... }}
  out = out.replace(/@@GDD_ESC_(\d+)@@/g, (_m, i) => escapes[Number(i)]);
  return out;
}

/** Placeholders genuinely substituted (escaped \{{...}} excluded) — used by the catalogue test. */
function placeholdersUsed(text) {
  if (typeof text !== 'string') return new Set();
  const scrubbed = String(text).replace(/\\\{\{[\s\S]*?\}\}/g, '');
  const used = new Set();
  const re = /\{\{([a-z_]+)\}\}/g;
  let m;
  while ((m = re.exec(scrubbed)) !== null) used.add(m[1]);
  return used;
}

module.exports = { compile, placeholdersUsed, stripHarnessOnly, PLACEHOLDERS };
