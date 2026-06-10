'use strict';
// Phase 44 - generate HARNESSES.md from the harness SoT (scripts/lib/manifest/harnesses.json). Maintainer-only (NOT shipped).
const fs = require('fs');
const path = require('path');
const { readHarnesses } = require('./lib/manifest/index.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'HARNESSES.md');

/**
 * GitHub-compatible heading slug.
 * Rules: lowercase, strip all chars except alphanumeric/space/hyphen, replace spaces with hyphens.
 * Consecutive hyphens (from " - " in headings) are preserved.
 * @param {string} text - heading text (no leading # chars)
 * @returns {string}
 */
function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Parse all headings from a markdown file and return a Set of their slugs.
 * @param {string} filePath
 * @returns {Set<string>}
 */
function parseHeadingSlugs(filePath) {
  const slugs = new Set();
  if (!fs.existsSync(filePath)) return slugs;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      slugs.add(githubSlug(m[2].trim()));
    }
  }
  return slugs;
}

/**
 * Check all fragment_links[] entries across harnesses.
 * For each "reference/<file>.md#<anchor>" asserts the file exists and its heading slugifies to that anchor.
 * @returns {{ ok: boolean, missing: string[] }}
 */
function checkCrossLinks() {
  const { harnesses } = readHarnesses();
  const missing = [];

  // Cache slug sets per file to avoid re-reading
  const slugCache = new Map();
  function getSlugs(relPath) {
    if (!slugCache.has(relPath)) {
      const abs = path.join(ROOT, relPath);
      slugCache.set(relPath, { exists: fs.existsSync(abs), slugs: parseHeadingSlugs(abs) });
    }
    return slugCache.get(relPath);
  }

  for (const h of harnesses) {
    for (const link of (h.fragment_links || [])) {
      const hashIdx = link.indexOf('#');
      if (hashIdx === -1) {
        // No anchor - just check file exists
        const { exists } = getSlugs(link);
        if (!exists) missing.push(`${h.id}: ${link} (file not found)`);
        continue;
      }
      const filePart = link.slice(0, hashIdx);
      const anchor = link.slice(hashIdx + 1);
      const { exists, slugs } = getSlugs(filePart);
      if (!exists) {
        missing.push(`${h.id}: ${link} (file not found: ${filePart})`);
      } else if (!slugs.has(anchor)) {
        missing.push(`${h.id}: ${link} (anchor #${anchor} not found in ${filePart})`);
      }
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Format a boolean capability value for the matrix table.
 * @param {boolean|undefined} val
 * @returns {string}
 */
function fmtBool(val) {
  if (val === true) return 'yes';
  if (val === false) return 'no';
  return '-';
}

/**
 * Format a list of frontmatter fields as a compact string.
 * @param {string[]|undefined} fields
 * @returns {string}
 */
function fmtFields(fields) {
  if (!fields || fields.length === 0) return '-';
  return fields.join(', ');
}

/**
 * Render the full HARNESSES.md content from the manifest.
 * @returns {string}
 */
function render() {
  const { harnesses } = readHarnesses();

  // Compute "Last verified" stamp: most recent non-null last_verified, or "(never)"
  const dates = harnesses.map((h) => h.last_verified).filter(Boolean).sort();
  const lastVerified = dates.length > 0 ? dates[dates.length - 1] : '(never)';

  // Capability matrix table.
  //
  // AR5/AR8 (Phase 59.8): added the **Agents** and **Hooks** columns so the
  // matrix is honest about which runtimes receive the sub-agent set and the
  // hook layer. Only Claude Code gets agents (claude --local installs
  // `agents/`) and hooks (SessionStart / PostToolUse / statusLine); every
  // other runtime receives skills only. The README previously implied agents
  // travel everywhere — these columns make the reality explicit.
  const tableHeader = [
    '| Harness | Status | Command syntax | Skill discovery | Frontmatter fields | MCP | Placeholders | Agents | Hooks | Install path |',
    '|---------|--------|---------------|-----------------|-------------------|-----|-------------|--------|-------|-------------|',
  ];

  const tableRows = harnesses.map((h) => {
    const cm = h.capability_matrix || {};
    const harnessCel = `${h.name} (\`${h.id}\`)`;
    return [
      '',
      harnessCel,
      cm.status || '-',
      cm.command_syntax || '-',
      fmtBool(cm.skill_discovery),
      fmtFields(cm.frontmatter_fields_supported),
      fmtBool(cm.mcp_support),
      fmtBool(cm.placeholder_substitution),
      fmtBool(cm.agents_support),
      fmtBool(cm.hooks_support),
      cm.install_path || '-',
      '',
    ].join(' | ').trim();
  });

  // Per-harness detail sections
  const detailSections = harnesses.map((h) => {
    const cm = h.capability_matrix || {};
    const lines = [];
    lines.push(`### ${h.name} (\`${h.id}\`)`);
    lines.push('');
    lines.push(`- **Status:** ${cm.status || '-'}`);
    lines.push(`- **Install path:** \`${cm.install_path || '-'}\``);
    // AR5/AR8 (Phase 59.8): surface agents + hooks reality per harness.
    lines.push(`- **Agents:** ${fmtBool(cm.agents_support)}`);
    lines.push(`- **Hooks:** ${fmtBool(cm.hooks_support)}`);
    if (h.capability_notes && h.capability_notes.trim()) {
      lines.push(`- **Notes:** ${h.capability_notes.trim()}`);
    }
    if (h.fragment_links && h.fragment_links.length > 0) {
      const linkList = h.fragment_links
        .map((l) => {
          const hashIdx = l.indexOf('#');
          const label = hashIdx !== -1 ? l.slice(hashIdx + 1) : l;
          return `[${label}](${l})`;
        })
        .join(', ');
      lines.push(`- **Deep dives:** ${linkList}`);
    }
    return lines.join('\n');
  });

  return `# HARNESSES.md - Harness Capability Matrix

> GENERATED FILE. Do not edit by hand. Source: scripts/lib/manifest/harnesses.json. Regenerate: npm run build:harnesses; CI drift-gates it.

**Last verified:** ${lastVerified}

## Capability matrix

${tableHeader.join('\n')}
${tableRows.join('\n')}

> **Agents / Hooks columns:** the GDD sub-agents and the hook layer are
> **Claude-specific**. Only Claude Code receives the 64 sub-agents (via
> \`--claude --local\`, which installs \`agents/\`) and the hooks
> (SessionStart / PostToolUse / statusLine). Every other runtime receives the
> compiled **skills only** — its source agents and hooks do not travel. The
> shared skill sources are what get compiled to each runtime; agents and hooks
> are not.

## Status legend

The following status values describe the confidence level for each harness entry:

- **tested** - regression baseline established and independently verified within the last 60 days. Only \`tested\` harnesses carry a freshness guarantee.
- **experimental** - compiles and has been manually confirmed to work at least once, but no independent regression baseline exists.
- **untested** - configuration compiles and passes static validation, but has never been run end-to-end.
- **known-broken** - known open issues prevent reliable operation.

Note: only \`tested\` harnesses carry a freshness guarantee. All other statuses indicate varying degrees of uncertainty about real-world behavior.

## Per-harness details

${detailSections.join('\n\n')}
`;
}

function main(argv) {
  const generated = render();

  if (argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== generated) {
      process.stderr.write('generate-harnesses-md --check: HARNESSES.md is stale. Run `npm run build:harnesses`.\n');
      return 1;
    }
    process.stdout.write('generate-harnesses-md --check: HARNESSES.md is current.\n');
    return 0;
  }

  // Cross-link check - warn and fail so stale cross-links in harnesses.json are surfaced.
  // Fix data in scripts/lib/manifest/harnesses.json (not this script) when anchors are wrong.
  const linkResult = checkCrossLinks();
  if (!linkResult.ok) {
    process.stderr.write('generate-harnesses-md: broken fragment links in harnesses.json (fix data, not this script):\n');
    for (const m of linkResult.missing) {
      process.stderr.write(`  - ${m}\n`);
    }
    return 1;
  }

  fs.writeFileSync(OUT, generated);
  const lineCount = generated.split('\n').length;
  process.stdout.write(`generate-harnesses-md: wrote HARNESSES.md (${lineCount} lines)\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, render, checkCrossLinks };
