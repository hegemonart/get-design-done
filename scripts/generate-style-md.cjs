'use strict';
// Phase 43 — generate STYLE.md from the single denylist SoT (scripts/lib/manifest/prose-denylist.json).
// Maintainer-only (NOT shipped). `node scripts/generate-style-md.cjs` writes STYLE.md;
// `--check` compares generated vs committed and exits 1 on drift (the STYLE.md drift gate).
const fs = require('fs');
const path = require('path');
const { readProseDenylist } = require('./lib/manifest/index.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'STYLE.md');

function decode(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

function render() {
  const { tells } = readProseDenylist();
  const phrases = tells.filter((t) => t.kind === 'phrase');
  const tokens = tells.filter((t) => t.kind === 'token');

  const phraseRows = phrases
    .map((t) => `| \`${t.pattern}\` | ${t.note} |`)
    .join('\n');
  const tokenRows = tokens
    .map((t) => {
      const d = decode(t.pattern);
      const shown = d === '—' ? 'em dash (`—`)' : d === '--' ? 'double hyphen (`--`)' : `\`${d}\``;
      return `| ${shown} | ${t.note} |`;
    })
    .join('\n');

  return `# STYLE.md - Editorial Quality Floor

> GENERATED FILE. Do not edit by hand. Source of truth: \`scripts/lib/manifest/prose-denylist.json\`
> (the Phase 41.5 manifest root). Regenerate with \`npm run build:style\`; CI drift-gates it.

Get Design Done audits design quality. Phase 43 holds the project's OWN prose to the same floor: a
build-time linter (\`scripts/lint-prose.cjs\`, \`npm run lint:prose\`) fails CI on em dashes, double
hyphens, and AI-prose tells in user-facing documentation. Trust in a quality tool erodes when its own
surface reads like unedited model output.

## Banned tokens

| Token | Why |
|-------|-----|
${tokenRows}

Replace an em dash with a spaced hyphen, a comma, a colon, or parentheses. Replace a double hyphen the
same way (CLI flags belong in \`code\` spans, which are skipped).

## Banned phrases (AI-prose tells)

These words cluster in model output and read as generic. Prefer the plain alternative.

| Phrase | Why |
|--------|-----|
${phraseRows}

## Scope

\`lint:prose\` scans: \`README.md\`, \`README.*.md\`, \`SKILL.md\`, \`source/skills/**/*.md\`,
\`agents/**/*.md\`, \`CHANGELOG.md\`, \`reference/**/*.md\`. The generated \`skills/\` and \`dist/\`
trees are NOT scanned (\`source/skills/\` is the authored copy). Files that are majority Cyrillic are
skipped (the denylist is English-only in v1).

## Skipped (not linted)

- Fenced code blocks (\`\`\` and \`~~~\`, any indentation) and inline \`code\` spans.
- YAML frontmatter and HTML comments.
- Content inside a disable block (see below).

## Escaping a genuine occurrence

For a real quote or example that must contain a banned token, wrap it:

\`\`\`
<!-- prose-lint-disable -->
"It was the best of times — it was the worst of times."
<!-- prose-lint-enable -->
\`\`\`

## Frontmatter

\`validate-frontmatter\` applies the same denylist to skill \`description\` fields (the highest-impact
prose surface). Keep descriptions plain.
`;
}

function main(argv) {
  const generated = render();
  if (argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== generated) {
      process.stderr.write('generate-style-md --check: STYLE.md is stale. Run `npm run build:style`.\n');
      return 1;
    }
    process.stdout.write('generate-style-md --check: STYLE.md is current.\n');
    return 0;
  }
  fs.writeFileSync(OUT, generated);
  process.stdout.write(`generate-style-md: wrote STYLE.md (${render().split('\n').length} lines)\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, render };
