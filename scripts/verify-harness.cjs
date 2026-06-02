'use strict';
// verify-harness.cjs — Phase 44 maintainer-only tool. NOT shipped to end users.
//
//   node scripts/verify-harness.cjs <id>
//
// Runs the Phase 42 compile + smoke for one harness and, on success, stamps
// `last_verified` (today, YYYY-MM-DD) into scripts/lib/manifest/harnesses.json
// for that id and regenerates HARNESSES.md.
//
// This script is intentionally NOT wired into package.json or CI. It exists
// so a maintainer can mark a harness as manually verified after QA.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(__dirname, 'lib', 'manifest', 'harnesses.json');

// Placeholder tokens that must NOT appear in any compiled body.
const UNRESOLVED_PLACEHOLDERS = [
  '{{command_prefix}}',
  '{{model}}',
  '{{config_file}}',
  '{{ask_instruction}}',
];

// Expected source skill count (Phase 42 golden baseline).
const EXPECTED_SKILL_COUNT = 107;

/**
 * Verify one harness by id.
 *
 * @param {string} id  Harness id (e.g. 'claude', 'codex').
 * @param {{ nowMs?: number }} [options]
 *   nowMs — override Date.now() for testing (avoids mutating last_verified to today).
 * @returns {{ ok: true, id: string, last_verified: string }
 *          |{ ok: false, error: string }}
 */
function verifyHarness(id, options) {
  const opts = options || {};

  // 1. Resolve build config.
  const { byId } = require('./lib/build/harness-configs.cjs');
  const cfg = byId(id);
  if (!cfg) {
    return { ok: false, error: 'unknown harness: ' + id };
  }

  // 2. Compile smoke.
  const { compileAll } = require('./build-skills.cjs');
  let map;
  try {
    map = compileAll(cfg);
  } catch (err) {
    return { ok: false, error: 'compile smoke failed: ' + err.message };
  }

  if (map.size !== EXPECTED_SKILL_COUNT) {
    return {
      ok: false,
      error: 'compile smoke failed: expected ' + EXPECTED_SKILL_COUNT +
             ' skills, got ' + map.size,
    };
  }

  const badFiles = [];
  for (const [rel, body] of map) {
    for (const token of UNRESOLVED_PLACEHOLDERS) {
      if (body.includes(token)) {
        badFiles.push(rel + ' contains unresolved ' + token);
        break;
      }
    }
  }
  if (badFiles.length > 0) {
    return {
      ok: false,
      error: 'compile smoke failed: unresolved placeholders in:\n  ' +
             badFiles.slice(0, 5).join('\n  ') +
             (badFiles.length > 5 ? '\n  ...' : ''),
    };
  }

  // 3. Stamp last_verified in harnesses.json (atomic write).
  const today = new Date(typeof opts.nowMs === 'number' ? opts.nowMs : Date.now())
    .toISOString()
    .slice(0, 10);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  } catch (err) {
    return { ok: false, error: 'could not read harnesses.json: ' + err.message };
  }

  const record = (data.harnesses || []).find((h) => h.id === id);
  if (!record) {
    return { ok: false, error: 'harness id "' + id + '" not found in harnesses.json' };
  }
  record.last_verified = today;

  const tmp = JSON_PATH + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, JSON_PATH);
  } catch (err) {
    // Clean up temp file if rename failed.
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    return { ok: false, error: 'could not write harnesses.json: ' + err.message };
  }

  // 4. Regenerate HARNESSES.md (lazy require — generate-harnesses-md.cjs may not
  //    exist at module load time; it is only required when verify actually runs).
  try {
    const genPath = path.join(__dirname, 'generate-harnesses-md.cjs');
    const gen = require(genPath); // lazy
    if (typeof gen.main === 'function') {
      gen.main([]);
    } else if (typeof gen.render === 'function') {
      const md = gen.render();
      fs.writeFileSync(path.join(REPO_ROOT, 'HARNESSES.md'), md, 'utf8');
    } else {
      process.stderr.write(
        'verify-harness: generate-harnesses-md.cjs exports neither main() nor render() — HARNESSES.md not updated\n'
      );
    }
  } catch (err) {
    process.stderr.write(
      'verify-harness: could not regenerate HARNESSES.md: ' + err.message + '\n'
    );
    // Non-fatal: the stamp already landed; warn but still return ok.
  }

  return { ok: true, id, last_verified: today };
}

/**
 * CLI entry point.
 *
 * @param {string[]} argv  Process args after `process.argv.slice(2)`.
 * @returns {number} Exit code (0 = success, 1 = failure).
 */
function main(argv) {
  const id = argv[0];
  if (!id) {
    process.stderr.write('Usage: node scripts/verify-harness.cjs <harness-id>\n');
    process.stderr.write('Example: node scripts/verify-harness.cjs claude\n');
    return 1;
  }

  const res = verifyHarness(id);
  if (res.ok) {
    process.stdout.write(
      'verify-harness: OK — ' + res.id + ' last_verified=' + res.last_verified + '\n'
    );
  } else {
    process.stderr.write('verify-harness: FAIL — ' + res.error + '\n');
  }
  return res.ok ? 0 : 1;
}

module.exports = { main, verifyHarness };

if (require.main === module) process.exit(main(process.argv.slice(2)));
