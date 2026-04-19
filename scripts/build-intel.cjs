#!/usr/bin/env node
/**
 * build-intel.cjs — Full initial index builder for .design/intel/ store
 *
 * Usage: node scripts/build-intel.cjs [--force]
 *
 * Scans all skill, agent, reference, connection, script, hook files in the
 * project and writes ten JSON slices to .design/intel/.
 *
 * On subsequent runs, only re-extracts slices for files whose mtime or git
 * hash has changed (incremental). Pass --force to rebuild all slices.
 *
 * .design/intel/ is gitignored — this script ships tracked, data does not.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const INTEL_DIR = path.join(ROOT, '.design', 'intel');
const FORCE = process.argv.includes('--force');

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function writeSlice(name, data) {
  const dest = path.join(INTEL_DIR, name);
  fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  wrote ${name}`);
}

function gitHash(filePath) {
  try {
    const r = spawnSync('git', ['log', '-1', '--format=%h', '--', filePath], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    });
    return r.stdout.trim() || 'untracked';
  } catch { return 'untracked'; }
}

function headHash() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    });
    return r.stdout.trim() || 'unknown';
  } catch { return 'unknown'; }
}

function getMtime(filePath) {
  try { return fs.statSync(filePath).mtime.toISOString(); }
  catch { return null; }
}

function getSize(filePath) {
  try { return fs.statSync(filePath).size; }
  catch { return 0; }
}

// ── File discovery ───────────────────────────────────────────────────────────

function classifyFile(rel) {
  if (rel.startsWith('skills/')) return 'skill';
  if (rel.startsWith('agents/')) return 'agent';
  if (rel.startsWith('reference/')) return 'reference';
  if (rel.startsWith('connections/')) return 'connection';
  if (rel.startsWith('scripts/')) return 'script';
  if (rel.startsWith('hooks/')) return 'hook';
  if (rel.startsWith('tests/')) return 'test';
  if (rel.endsWith('.json') || rel.endsWith('.yaml') || rel.endsWith('.yml')) return 'config';
  return 'other';
}

function discoverFiles() {
  const DIRS = ['skills', 'agents', 'reference', 'connections', 'scripts', 'hooks', 'tests'];
  const EXTS = new Set(['.md', '.cjs', '.js', '.json', '.yaml', '.yml']);
  const results = [];

  for (const dir of DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    walkDir(abs, ROOT, EXTS, results);
  }

  // Also include top-level config files
  for (const f of ['CLAUDE.md', 'README.md']) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) results.push(path.relative(ROOT, abs).replace(/\\/g, '/'));
  }

  return results;
}

function walkDir(dir, root, exts, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, root, exts, out);
    } else if (exts.has(path.extname(entry.name))) {
      out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }
}

// ── Changed-file detection ───────────────────────────────────────────────────

function changedFiles(allFiles, existingFilesSlice) {
  if (FORCE || !existingFilesSlice) return allFiles;

  const index = {};
  for (const f of (existingFilesSlice.files || [])) {
    index[f.path] = { mtime: f.mtime, git_hash: f.git_hash };
  }

  return allFiles.filter(rel => {
    const abs = path.join(ROOT, rel);
    const prev = index[rel];
    if (!prev) return true;
    const curMtime = getMtime(abs);
    const curHash = gitHash(rel);
    return curMtime !== prev.mtime || curHash !== prev.git_hash;
  });
}

// ── Frontmatter parser ───────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

// ── Slice builders ───────────────────────────────────────────────────────────

function buildFilesSlice(allFiles) {
  return {
    generated: now(),
    git_hash: headHash(),
    files: allFiles.map(rel => {
      const abs = path.join(ROOT, rel);
      return {
        path: rel,
        type: classifyFile(rel),
        mtime: getMtime(abs),
        size_bytes: getSize(abs),
        git_hash: gitHash(rel),
      };
    }),
  };
}

function buildExportsSlice(allFiles) {
  const exports = [];
  for (const rel of allFiles) {
    if (!rel.endsWith('.md')) continue;
    const abs = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const fm = parseFrontmatter(content);
    if (!fm.name) continue;

    const kind = classifyFile(rel);
    const entry = { file: rel, kind, name: fm.name };
    // Skills have a command derived from name (gdd-foo → /gdd:foo)
    if (kind === 'skill' && fm.name.startsWith('gdd-')) {
      entry.command = '/gdd:' + fm.name.replace(/^gdd-/, '');
    }
    exports.push(entry);
  }
  return { generated: now(), exports };
}

function buildSymbolsSlice(allFiles) {
  const symbols = [];
  const HEADING_RE = /^(#{1,4})\s+(.+)$/gm;
  for (const rel of allFiles) {
    if (!rel.endsWith('.md')) continue;
    const abs = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^(#{1,4})\s+(.+)$/);
      if (!m) return;
      const heading = m[0];
      const level = m[1].length;
      const text = m[2].trim();
      const anchor = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      symbols.push({ file: rel, heading, level, anchor, line: i + 1 });
    });
  }
  return { generated: now(), symbols };
}

function buildTokensSlice(allFiles) {
  const tokens = [];
  const TOKEN_RE = /--[\w-]+(color|space|spacing|font|radius|shadow|motion|size|weight|line)[^\s,;)']*/gi;
  const CAT_MAP = {
    color: 'color', space: 'spacing', spacing: 'spacing',
    font: 'typography', radius: 'radius', shadow: 'shadow', motion: 'motion',
  };
  for (const rel of allFiles) {
    if (!rel.endsWith('.md') && !rel.endsWith('.cjs') && !rel.endsWith('.js')) continue;
    const abs = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m;
      const re = /--[\w-]+/g;
      while ((m = re.exec(line)) !== null) {
        const token = m[0];
        // Categorise by suffix keywords
        let category = 'other';
        for (const [key, cat] of Object.entries(CAT_MAP)) {
          if (token.includes(key)) { category = cat; break; }
        }
        if (category === 'other' && !token.includes('-')) continue;
        tokens.push({ file: rel, token, category, line: i + 1, context: line.trim().slice(0, 80) });
      }
    });
  }
  return { generated: now(), tokens };
}

function buildComponentsSlice(allFiles) {
  const components = [];
  // PascalCase component names in markdown
  const COMP_RE = /\b([A-Z][a-zA-Z0-9]{2,})\b/g;
  const SKIP = new Set(['WCAG', 'CSS', 'JSON', 'HTML', 'URL', 'API', 'MCP', 'GDD', 'UI', 'UX', 'ISO']);
  for (const rel of allFiles) {
    if (!rel.endsWith('.md')) continue;
    const abs = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      // Skip code blocks
      if (line.trim().startsWith('```') || line.trim().startsWith('`')) return;
      let m;
      while ((m = COMP_RE.exec(line)) !== null) {
        const name = m[1];
        if (SKIP.has(name)) continue;
        const role = line.includes('define') || line.includes('export') ? 'definition' : 'reference';
        components.push({ file: rel, component: name, role, line: i + 1 });
      }
    });
  }
  // Deduplicate by file+component+line
  const seen = new Set();
  return {
    generated: now(),
    components: components.filter(c => {
      const key = `${c.file}:${c.component}:${c.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

function buildPatternsSlice(allFiles) {
  const patterns = [];
  const PATTERN_CATS = ['color-system', 'spacing-system', 'typography-system', 'component-styling', 'layout', 'interaction'];
  for (const rel of allFiles) {
    if (!rel.endsWith('.md')) continue;
    const abs = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    for (const cat of PATTERN_CATS) {
      if (content.includes(cat)) {
        // Find the line
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes(cat)) {
            const name = cat;
            patterns.push({
              name,
              category: cat,
              source_file: rel,
              description: line.trim().slice(0, 100),
            });
          }
        });
      }
    }
  }
  // Deduplicate
  const seen = new Set();
  return {
    generated: now(),
    patterns: patterns.filter(p => {
      const key = `${p.source_file}:${p.category}:${p.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

function buildDependenciesSlice(allFiles) {
  const dependencies = [];
  // @-references in markdown
  const AT_REF_RE = /@([\w./\-]+\.md)/g;
  // reads-from in agent frontmatter (reads: field)
  for (const rel of allFiles) {
    if (!rel.endsWith('.md')) continue;
    const abs = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m;
      while ((m = AT_REF_RE.exec(line)) !== null) {
        const target = m[1];
        dependencies.push({ from: rel, to: target, kind: 'at-reference', line: i + 1 });
      }
    });
    // Check frontmatter reads field
    const fm = parseFrontmatter(content);
    if (fm.reads) {
      // reads: comma or space separated list
      const targets = fm.reads.split(/[\s,]+/).filter(Boolean);
      for (const t of targets) {
        if (t.endsWith('.md') || t.endsWith('.json')) {
          dependencies.push({ from: rel, to: t, kind: 'reads-from', line: 1 });
        }
      }
    }
  }
  return { generated: now(), dependencies };
}

function buildDecisionsSlice() {
  // Decisions come from .design/DESIGN-CONTEXT.md (runtime, may not exist at build time)
  const decisions = [];
  const CONTEXT_FILE = path.join(ROOT, '.design', 'DESIGN-CONTEXT.md');
  if (!fs.existsSync(CONTEXT_FILE)) {
    return { generated: now(), decisions };
  }
  const content = fs.readFileSync(CONTEXT_FILE, 'utf8');
  const lines = content.split('\n');
  const DECISION_RE = /\b(D-\d+)[:\s]+(.+)/;
  lines.forEach((line, i) => {
    const m = line.match(DECISION_RE);
    if (m) {
      decisions.push({
        id: m[1],
        summary: m[2].trim().slice(0, 120),
        source_file: '.design/DESIGN-CONTEXT.md',
        line: i + 1,
        date: now().slice(0, 10),
      });
    }
  });
  return { generated: now(), decisions };
}

function buildDebtSlice() {
  const debt = [];
  const DEBT_FILE = path.join(ROOT, '.design', 'DESIGN-DEBT.md');
  if (!fs.existsSync(DEBT_FILE)) {
    return { generated: now(), debt };
  }
  const content = fs.readFileSync(DEBT_FILE, 'utf8');
  const lines = content.split('\n');
  const ITEM_RE = /[-*]\s+(?:\*\*(DEBT-\d+|high|medium|low)\*\*[:\s]+)?(.+)/i;
  const SEV_RE = /high|medium|low/i;
  let debtId = 0;
  lines.forEach((line, i) => {
    const m = line.match(ITEM_RE);
    if (!m) return;
    const sevMatch = line.match(SEV_RE);
    const severity = sevMatch ? sevMatch[0].toLowerCase() : 'medium';
    debtId++;
    const id = line.match(/DEBT-\d+/) ? line.match(/DEBT-\d+/)[0] : `DEBT-${String(debtId).padStart(2, '0')}`;
    debt.push({
      id,
      summary: m[2].trim().slice(0, 120),
      severity,
      source_file: '.design/DESIGN-DEBT.md',
      line: i + 1,
    });
  });
  return { generated: now(), debt };
}

function buildGraphSlice(filesSlice, depsSlice) {
  const nodes = (filesSlice.files || []).map(f => ({
    id: f.path,
    type: f.type,
    name: path.basename(f.path, path.extname(f.path)),
  }));
  const edges = (depsSlice.dependencies || []).map(d => ({
    from: d.from,
    to: d.to,
    kind: d.kind,
  }));
  return { generated: now(), nodes, edges };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('build-intel: starting' + (FORCE ? ' (--force)' : ''));
  ensureDir(INTEL_DIR);

  const existingFiles = readJson(path.join(INTEL_DIR, 'files.json'));
  const allFiles = discoverFiles();
  const changed = changedFiles(allFiles, existingFiles);

  console.log(`  discovered ${allFiles.length} files, ${changed.length} changed`);

  // Always rebuild files slice when any file changed
  const filesSlice = buildFilesSlice(allFiles);
  writeSlice('files.json', filesSlice);

  // Rebuild content slices only for changed files (or all if force)
  const targetFiles = FORCE ? allFiles : changed;

  // For simplicity, rebuild all content slices when any file changed.
  // A production version would merge existing slices with updated entries.
  if (targetFiles.length > 0 || FORCE) {
    writeSlice('exports.json', buildExportsSlice(allFiles));
    writeSlice('symbols.json', buildSymbolsSlice(allFiles));
    writeSlice('tokens.json', buildTokensSlice(allFiles));
    writeSlice('components.json', buildComponentsSlice(allFiles));
    writeSlice('patterns.json', buildPatternsSlice(allFiles));
    const depsSlice = buildDependenciesSlice(allFiles);
    writeSlice('dependencies.json', depsSlice);
    writeSlice('decisions.json', buildDecisionsSlice());
    writeSlice('debt.json', buildDebtSlice());
    writeSlice('graph.json', buildGraphSlice(filesSlice, depsSlice));
  } else {
    console.log('  no changes detected — skipping content slices');
  }

  console.log('build-intel: done');
  console.log(`  output: ${INTEL_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
