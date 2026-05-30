# Baseline — Relock Instructions

`test-fixture/baselines/current/` is the single locked baseline for both
structural regression tests and the release smoke test. No new phase
subdirectories are created; this directory is updated in-place on each release.

## Contents

| File | Purpose |
|------|---------|
| `agent-list.txt` | Expected `design-*.md` agent filenames |
| `skill-list.txt` | Expected `skills/` subdirectory names |
| `connection-list.txt` | Expected `connections/*.md` filenames |
| `plugin-version.txt` | Minimum plugin version (semver) |
| `agent-frontmatter-snapshot.json` | Required frontmatter fields per agent |
| `sample-agent-metrics.json` | Reflector test fixture — agent metrics shape |
| `sample-costs.jsonl` | Reflector test fixture — costs.jsonl shape |
| `expected-reflection-proposals.json` | Reflector test fixture — expected proposal shape |
| `BASELINE.md` | Smoke test manifest |

## When to relock

Relock when a change adds, renames, or removes agents / skills / connections,
changes agent frontmatter fields, or changes `build-intel.cjs` output.

## Re-lock procedure

Run from the repo root:

```bash
# 1. Regenerate structural inventory
git ls-files agents/ | grep 'design-.*\.md' | xargs -I{} basename {} | sort \
  > test-fixture/baselines/current/agent-list.txt

git ls-files skills/ | awk -F/ 'NF>=2{print $2}' | sort -u \
  > test-fixture/baselines/current/skill-list.txt

ls connections/*.md | xargs -I{} basename {} | sort \
  > test-fixture/baselines/current/connection-list.txt

node -e "process.stdout.write(require('./.claude-plugin/plugin.json').version + '\n')" \
  > test-fixture/baselines/current/plugin-version.txt

# 2. Regenerate agent frontmatter snapshot
node -e "
const fs = require('fs'), path = require('path');
const agents = fs.readdirSync('agents').filter(f => f.startsWith('design-') && f.endsWith('.md')).sort();
const snap = {};
for (const f of agents) {
  const m = fs.readFileSync(path.join('agents', f), 'utf8').match(/^---\n([\S\s]*?)\n---/);
  snap[f] = m ? [...m[1].matchAll(/^(\w[\w-]*):/gm)].map(k => k[1]).sort() : [];
}
fs.writeFileSync('test-fixture/baselines/current/agent-frontmatter-snapshot.json', JSON.stringify(snap, null, 2) + '\n');
"

# 3. Regenerate smoke test baseline (only if build-intel.cjs output changed)
TMPDIR=\$(mktemp -d)
cp -r test-fixture/src/* "\$TMPDIR/"
(cd "\$TMPDIR" && node "\$OLDPWD/scripts/build-intel.cjs" .)
rm -rf test-fixture/baselines/current/intel/
if [ -d "\$TMPDIR/.design/intel" ]; then
  mkdir -p test-fixture/baselines/current/intel
  cp "\$TMPDIR/.design/intel/"*.json test-fixture/baselines/current/intel/
fi
rm -rf "\$TMPDIR"
```

Then update `BASELINE.md` (locked date, version, invariant counts), verify
`npm test` passes locally, and include the baseline commit in your PR.
