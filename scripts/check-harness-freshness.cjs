// Phase 44 - check-harness-freshness.cjs CLI. Maintainer/CI only (NOT shipped). warn>60d / fail>180d on `tested` harnesses.
'use strict';

const { checkFreshness } = require('./lib/harness-freshness.cjs');

/**
 * @param {string[]} argv  process.argv slice (after the node + script args)
 * @returns {number}       exit code: 1 if any tested harness has freshness 'fail', else 0
 */
function main(argv) {
  const jsonMode = argv.includes('--json');
  const results = checkFreshness();

  if (jsonMode) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    for (const r of results) {
      const agePart = r.age_days !== null ? String(r.age_days) : 'n/a';
      process.stdout.write(`${r.id}\t${r.status}\t${agePart}\t${r.freshness}\n`);
    }
  }

  const hasFail = results.some((r) => r.freshness === 'fail');
  return hasFail ? 1 : 0;
}

module.exports = { main };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
