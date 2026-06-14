// scripts/lib/incubator-author.cjs
//
// Plan 29-04 — Capability-Gap Self-Authoring: incubator-author module.
//
// Phase 29 SC #4 — Stable capability-gap clusters → reviewable drafts under
// `.design/reflections/incubator/<slug>/`. Strictly proposal-only: this module
// never writes to production `agents/` or `skills/` paths. Promotion is handled
// by Plan 29-05's `/hone:apply-reflections accept` action.
//
// Contract:
//   draftClusters(input, options) → { drafts, skipped, deferred }
//
// Pipeline (per cluster, in `cluster_id` ascending order):
//
//   1. Gate A — stability (size).         size < stabilityK → skipped.
//   2. Gate B — stability (stddev).       posterior.stddev missing OR >=
//                                         stddevThreshold → skipped.
//   3. Gate C — suggested_kind.           Not 'skill'|'agent' → skipped.
//   4. Tools / description / tier / slug inference.
//   5. Gate D — similarity (D-09).        score ≥ similarityThreshold against
//                                         any existing artifact → deferred
//                                         with forward_to:
//                                         'phase_11_frontmatter_update'.
//   6. Frontmatter assembly + body render + scoped write (or dry-run skip).
//
// Decisions honoured (per Phase 29 CONTEXT.md):
//   * D-04 (single-step promotion gate).  Drafts live in the incubator until
//     29-05 ratifies them — this module never writes to production paths.
//   * D-05 (scope guard).                 `safeWritePath` resolves every
//     output under INCUBATOR_ROOT and throws `incubator_path_escape: …`
//     on any traversal attempt. 29-05's `validate-incubator-scope.cjs`
//     enforces the promotion-time ceiling; this is the floor.
//   * D-09 (frontmatter-update vs new capability).  High-overlap clusters
//     are routed to Phase 11's frontmatter-update proposal class via the
//     deferred[] array — no draft is written for those.
//   * D-12 (`delegate_to: null` always).  Phase 27 forward-compat; every
//     emitted frontmatter carries the literal `delegate_to: null` key.
//
// Input cluster shape (produced by 29-03 — `reflector-capability-gap-aggregator.cjs`):
//
//   {
//     reflection_path, cycle_slug,
//     clusters: [
//       {
//         cluster_id, context_hash, intent_summary,
//         suggested_kind: 'skill' | 'agent',
//         size, sources: { fast, router, reflector_pattern },
//         posterior: { alpha, beta, stddev, arms?: [{tier, alpha, beta}] },
//         evidence_refs[], parent_event_ids[],
//         trajectory_refs: [ { trajectory_id, tools, observed_triggers } ],
//         cycles_observed[], first_seen_cycle, last_seen_cycle,
//         agent_type?, observed_tools?
//       }
//     ]
//   }
//
// Options:
//
//   * stabilityK           min cluster size       (default 3, per Phase 29 SC #3)
//   * stddevThreshold      Beta posterior gate    (default 0.05)
//   * similarityThreshold  D-09 cutoff            (default 0.8)
//   * similarityWeights    advanced; default max() combiner across signals
//   * fallbackTools        when no observed tools (default [Read,Grep,Glob])
//   * existingArtifacts    inject for tests; else loadExistingArtifacts(cwd)
//   * incubatorRoot        write target           (default INCUBATOR_ROOT)
//   * dryRun               skip file writes       (default false)
//   * now                  injected ISO timestamp (default new Date()…)
//   * repoRoot             used by loadExistingArtifacts (default cwd)
//
// Output shape:
//
//   {
//     drafts:   [{ cluster_id, slug, kind, path, frontmatter, body,
//                  written, inference: { slug_source, tools_source,
//                  default_tier_source, description_truncated } }],
//     skipped:  [{ cluster_id, reason, gate? }],
//     deferred: [{ cluster_id, slug, reason, nearest:{path,score,
//                  score_breakdown:{name,tools,description}},
//                  forward_to: 'phase_11_frontmatter_update' }],
//   }
//
// Style:
//   * CommonJS, deps = node:fs + node:path only.
//   * Pure logic except the optional `fs.writeFileSync` (skipped on dryRun).
//   * Deterministic ordering: arrays sorted by cluster_id ascending. Where
//     ties exist (e.g. similarity tiebreakers), break by path ascending.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const DEFAULT_STABILITY_K = 3;
const DEFAULT_STDDEV_THRESHOLD = 0.05;
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const DEFAULT_FALLBACK_TOOLS = Object.freeze(['Read', 'Grep', 'Glob']);
const INCUBATOR_ROOT = '.design/reflections/incubator';
const DESCRIPTION_SOFT_CAP = 200;
const TIERS = Object.freeze(['haiku', 'sonnet', 'opus']);

// Stopword set for tokenize() — small, English-only, deterministic.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'for', 'and', 'or',
  'in', 'on', 'by', 'with', 'is', 'are', 'be', 'this',
  'that', 'it', 'as', 'at', 'use', 'when',
]);

// Tools that we refuse to infer unless explicitly observed in trajectories.
const PRIVILEGED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// -------------------------------------------------------------------
// Small math + string helpers
// -------------------------------------------------------------------

function tokenize(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  const seen = new Set();
  for (const tok of str.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!tok) continue;
    if (STOPWORDS.has(tok)) continue;
    seen.add(tok);
  }
  return Array.from(seen).sort();
}

function cosineSim(tokensA, tokensB) {
  if (!Array.isArray(tokensA) || !Array.isArray(tokensB)) return 0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  // Both inputs are already sorted-unique sets from tokenize(); each weight 1.
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersect = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersect += 1;
  }
  const magA = Math.sqrt(setA.size);
  const magB = Math.sqrt(setB.size);
  if (magA === 0 || magB === 0) return 0;
  return intersect / (magA * magB);
}

function jaccard(setA, setB) {
  if (!setA || !setB) return 0;
  const a = setA instanceof Set ? setA : new Set(setA);
  const b = setB instanceof Set ? setB : new Set(setB);
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const v of a) {
    if (b.has(v)) intersect += 1;
  }
  const union = a.size + b.size - intersect;
  if (union === 0) return 0;
  return intersect / union;
}

function levenshteinNormalized(a, b) {
  const sa = String(a == null ? '' : a);
  const sb = String(b == null ? '' : b);
  if (sa.length === 0 && sb.length === 0) return 1.0;
  if (sa.length === 0 || sb.length === 0) return 0;
  const n = sa.length;
  const m = sb.length;
  // Single-row DP table.
  let prev = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;
  let curr = new Array(m + 1);
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = sa.charCodeAt(i - 1) === sb.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  const distance = prev[m];
  const maxLen = Math.max(n, m);
  return 1 - distance / maxLen;
}

// -------------------------------------------------------------------
// Slug derivation
// -------------------------------------------------------------------

function deriveSlug(intentSummary, existingSlugs) {
  const seen = existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs || []);
  const raw = typeof intentSummary === 'string' ? intentSummary : '';
  // 1. Lowercase.
  let s = raw.toLowerCase();
  // 2. Strip non-ASCII.
  s = s.replace(/[^\x20-\x7e]+/g, '');
  // 3. Replace whitespace + punctuation with `-`.
  s = s.replace(/[^a-z0-9]+/g, '-');
  // 4. Collapse repeated dashes (already done by single pass above, but
  //    a defensive second sweep covers replace edge cases).
  s = s.replace(/-+/g, '-');
  // 5. Trim leading/trailing dashes.
  s = s.replace(/^-+/, '').replace(/-+$/, '');
  // 6. Truncate to 40 chars.
  if (s.length > 40) s = s.slice(0, 40);
  // 7. Re-trim dashes after truncation.
  s = s.replace(/-+$/, '');
  if (!s) s = 'unnamed-capability';
  // 8. Dedupe against existingSlugs.
  if (!seen.has(s)) return s;
  let i = 2;
  while (seen.has(`${s}-${i}`)) i += 1;
  return `${s}-${i}`;
}

// -------------------------------------------------------------------
// Tools inference
// -------------------------------------------------------------------

function inferTools(cluster, fallbackTools) {
  const fallback = Array.isArray(fallbackTools) && fallbackTools.length
    ? Array.from(fallbackTools)
    : Array.from(DEFAULT_FALLBACK_TOOLS);

  // Collect observed tools either from per-trajectory `tools[]` arrays or from
  // a flat `observed_tools[]` field on the cluster.
  const counts = new Map();
  let observed = false;
  if (Array.isArray(cluster && cluster.trajectory_refs)) {
    for (const traj of cluster.trajectory_refs) {
      if (!traj || !Array.isArray(traj.tools)) continue;
      for (const tool of traj.tools) {
        if (typeof tool !== 'string' || !tool) continue;
        counts.set(tool, (counts.get(tool) || 0) + 1);
        observed = true;
      }
    }
  }
  if (!observed && Array.isArray(cluster && cluster.observed_tools)) {
    for (const tool of cluster.observed_tools) {
      if (typeof tool !== 'string' || !tool) continue;
      counts.set(tool, (counts.get(tool) || 0) + 1);
      observed = true;
    }
  }
  if (!observed) return fallback.slice();

  // Sort by frequency desc, then alphabetic asc (deterministic ties).
  const ranked = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
  const distinct = ranked.length;
  const N = Math.max(1, Math.min(5, distinct));
  // Privileged tools (Write/Edit/etc) only survive if they were genuinely
  // observed — counts.get(tool) > 0 already guarantees that here, so the
  // filter is a no-op except for safety against future call-sites that might
  // inject phantom entries.
  const picked = [];
  for (const [tool] of ranked) {
    if (PRIVILEGED_TOOLS.has(tool) && !counts.has(tool)) continue;
    picked.push(tool);
    if (picked.length >= N) break;
  }
  return picked;
}

// -------------------------------------------------------------------
// Default-tier inference
// -------------------------------------------------------------------

function inferDefaultTier(cluster, options, existingArtifacts) {
  // Branch 1 — posterior best-arm.
  const arms = cluster && cluster.posterior && Array.isArray(cluster.posterior.arms)
    ? cluster.posterior.arms
    : null;
  if (arms && arms.length >= 2) {
    let best = null;
    let bestMean = -Infinity;
    for (const arm of arms) {
      if (!arm || typeof arm.tier !== 'string') continue;
      const a = Number(arm.alpha);
      const b = Number(arm.beta);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a + b <= 0) continue;
      const mean = a / (a + b);
      if (mean > bestMean) {
        bestMean = mean;
        best = arm.tier;
      }
    }
    if (best && TIERS.includes(best)) {
      return { tier: best, source: 'posterior_best_arm' };
    }
  }

  // Branch 2 — agent_type frontmatter lookup.
  if (cluster && typeof cluster.agent_type === 'string' && Array.isArray(existingArtifacts)) {
    for (const art of existingArtifacts) {
      if (!art || !art.frontmatter) continue;
      if (art.frontmatter.name === cluster.agent_type) {
        const tier = art.frontmatter['default-tier'];
        if (typeof tier === 'string' && TIERS.includes(tier)) {
          return { tier, source: 'cluster.agent_type frontmatter' };
        }
      }
    }
  }

  // Branch 3 — fallback.
  return { tier: 'sonnet', source: 'fallback:sonnet' };
}

// -------------------------------------------------------------------
// Description builder
// -------------------------------------------------------------------

function buildDescription(cluster) {
  const raw = (cluster && typeof cluster.intent_summary === 'string') ? cluster.intent_summary.trim() : '';
  let what = raw || 'Capability gap detected';
  if (!/[.!?]$/.test(what)) what = `${what}.`;

  // Collect trigger frequencies.
  const trigCounts = new Map();
  if (Array.isArray(cluster && cluster.trajectory_refs)) {
    for (const traj of cluster.trajectory_refs) {
      if (!traj || typeof traj.observed_triggers !== 'string') continue;
      const t = traj.observed_triggers.trim();
      if (!t) continue;
      trigCounts.set(t, (trigCounts.get(t) || 0) + 1);
    }
  }
  const triggers = Array.from(trigCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return 0;
    })
    .slice(0, 2)
    .map((e) => e[0]);

  let triggerPhrase = triggers.length ? triggers.join(' or ') : 'needed';
  let desc = `${what} Use when ${triggerPhrase}.`;
  let truncated = false;

  if (desc.length > DESCRIPTION_SOFT_CAP) {
    // Truncate the trigger portion first; preserve `<what>. Use when ` prefix.
    const prefix = `${what} Use when `;
    const suffix = '... [truncated].';
    const budget = DESCRIPTION_SOFT_CAP - prefix.length - suffix.length;
    if (budget > 0) {
      triggerPhrase = triggerPhrase.slice(0, budget).trimEnd();
      desc = `${prefix}${triggerPhrase}${suffix}`;
    } else {
      // <what> alone already exceeds soft cap — truncate <what> as a last resort.
      desc = `${what.slice(0, DESCRIPTION_SOFT_CAP - 3)}...`;
    }
    truncated = true;
  }
  return { description: desc, truncated };
}

// -------------------------------------------------------------------
// Similarity scoring (D-09)
// -------------------------------------------------------------------

function computeSimilarity(probe, existingArtifacts) {
  if (!Array.isArray(existingArtifacts) || existingArtifacts.length === 0) return null;
  const probeSlug = probe && typeof probe.slug === 'string' ? probe.slug : '';
  const probeTools = probe && Array.isArray(probe.inferredTools) ? probe.inferredTools : [];
  const probeDesc = probe && typeof probe.description === 'string' ? probe.description : '';
  const probeDescTokens = tokenize(probeDesc);

  let best = null;
  for (const art of existingArtifacts) {
    if (!art || !art.frontmatter) continue;
    const fm = art.frontmatter;
    const existingName = typeof fm.name === 'string' ? fm.name : '';
    const existingDesc = typeof fm.description === 'string' ? fm.description : '';
    const existingTools = Array.isArray(fm.tools)
      ? fm.tools
      : (typeof fm.tools === 'string'
        ? fm.tools.split(',').map((s) => s.trim()).filter(Boolean)
        : []);

    const nameSim = levenshteinNormalized(probeSlug, existingName);
    const toolsSim = jaccard(new Set(probeTools), new Set(existingTools));
    const descSim = cosineSim(probeDescTokens, tokenize(existingDesc));
    const score = Math.max(nameSim, toolsSim, descSim);
    const entry = {
      path: art.path || '',
      score,
      score_breakdown: { name: nameSim, tools: toolsSim, description: descSim },
    };
    if (!best) { best = entry; continue; }
    if (entry.score > best.score) { best = entry; continue; }
    // Tie-break: smaller path string wins for determinism.
    if (entry.score === best.score && entry.path < best.path) { best = entry; }
  }
  return best;
}

// -------------------------------------------------------------------
// Body renderer
// -------------------------------------------------------------------

function renderOrigin(cluster, options, now) {
  const slug = (cluster && cluster.__slug) || (cluster && deriveSlug(cluster.intent_summary || '')) || 'unnamed-capability';
  const intent = (cluster && cluster.intent_summary) || '(intent unknown)';
  const cycles = Array.isArray(cluster && cluster.cycles_observed) ? cluster.cycles_observed : [];
  const cyclesCount = cycles.length;
  const size = Number(cluster && cluster.size) || 0;
  const sources = (cluster && cluster.sources) || { fast: 0, router: 0, reflector_pattern: 0 };
  const usage = size / Math.max(1, cyclesCount);
  const usageStr = Number.isFinite(usage) ? usage.toFixed(2) : '0.00';

  // Most-frequent parent_event_id.
  let topParent = '(none observed)';
  if (Array.isArray(cluster && cluster.parent_event_ids) && cluster.parent_event_ids.length) {
    const pcounts = new Map();
    for (const pid of cluster.parent_event_ids) {
      if (typeof pid !== 'string' || !pid) continue;
      pcounts.set(pid, (pcounts.get(pid) || 0) + 1);
    }
    const ranked = Array.from(pcounts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return 0;
    });
    if (ranked.length) topParent = ranked[0][0];
  }

  // Top 3 trajectory refs.
  const trajLines = [];
  const trajs = Array.isArray(cluster && cluster.trajectory_refs) ? cluster.trajectory_refs.slice(0, 3) : [];
  for (const t of trajs) {
    const tid = (t && t.trajectory_id) || '(unknown)';
    const tools = Array.isArray(t && t.tools) ? t.tools.join(', ') : '(none)';
    const trigger = (t && typeof t.observed_triggers === 'string') ? t.observed_triggers : '(none)';
    trajLines.push(`  - \`${tid}\` — tools: ${tools}, trigger: "${trigger}"`);
  }

  const stabilityK = (options && options.stabilityK) != null ? options.stabilityK : DEFAULT_STABILITY_K;
  const stddevThreshold = (options && options.stddevThreshold) != null ? options.stddevThreshold : DEFAULT_STDDEV_THRESHOLD;
  const alpha = (cluster && cluster.posterior && cluster.posterior.alpha != null) ? cluster.posterior.alpha : '(unknown)';
  const beta = (cluster && cluster.posterior && cluster.posterior.beta != null) ? cluster.posterior.beta : '(unknown)';
  const stddev = (cluster && cluster.posterior && cluster.posterior.stddev != null) ? cluster.posterior.stddev : '(unknown)';

  const clusterId = (cluster && cluster.cluster_id) || '(unknown)';
  const contextHash = (cluster && cluster.context_hash) || '(unknown)';
  const firstSeen = (cluster && cluster.first_seen_cycle) || '(unknown)';
  const lastSeen = (cluster && cluster.last_seen_cycle) || '(unknown)';

  const lines = [
    `@reference/shared-preamble.md`,
    ``,
    `# ${slug}`,
    ``,
    `> **DRAFT — INCUBATOR.** Generated by \`scripts/lib/incubator-author.cjs\` from capability-gap cluster \`${clusterId}\` on \`${now}\`. NOT yet promoted to production. Review via \`/hone:apply-reflections\` (Plan 29-05).`,
    ``,
    `## Role`,
    ``,
    `${intent} — drafted from ${size} capability_gap events across ${cyclesCount} cycles.`,
    ``,
    `(Plan 29-05 will render an editable diff vs nearest existing artifact before promotion. Reviewer fills in the role narrative; this is a stub.)`,
    ``,
    `## Origin`,
    ``,
    `This draft was synthesized from a recurring capability gap.`,
    ``,
    `- **Cluster ID:** \`${clusterId}\``,
    `- **Context hash:** \`${contextHash}\``,
    `- **First seen:** \`${firstSeen}\``,
    `- **Last seen:**  \`${lastSeen}\``,
    `- **Cluster size:** ${size} capability_gap events`,
    `- **Source distribution:** fast=${sources.fast || 0}, router=${sources.router || 0}, reflector_pattern=${sources.reflector_pattern || 0}`,
    `- **Usage frequency:** ${usageStr} events / cycle-window`,
    `- **Suggested integration point:** spawned/invoked alongside \`${topParent}\``,
    `- **Example trajectories:**`,
  ];
  if (trajLines.length === 0) {
    lines.push('  - (no trajectory refs observed)');
  } else {
    for (const line of trajLines) lines.push(line);
  }

  lines.push(
    ``,
    `## Posterior signal`,
    ``,
    `- α = ${alpha}, β = ${beta}, stddev = ${stddev}`,
    `- Stability gate (size ≥ ${stabilityK} AND stddev < ${stddevThreshold}): **passed**`,
    ``,
    `## Reviewer checklist (Plan 29-05)`,
    ``,
    `- [ ] Role narrative matches observed intent`,
    `- [ ] Frontmatter \`description\` reads naturally (≤ 200 chars)`,
    `- [ ] Tools set matches observed trajectories (no over-privileging)`,
    `- [ ] Similarity guard cleared: no nearest existing artifact ≥ 0.8 similarity`,
    `- [ ] Promotion target path is \`agents/<slug>.md\` OR \`skills/<slug>/SKILL.md\` (scope guard via \`scripts/validate-incubator-scope.cjs\`)`,
    ``,
  );

  return lines.join('\n');
}

// -------------------------------------------------------------------
// Frontmatter serializer
// -------------------------------------------------------------------

function quoteYamlString(s) {
  // Wrap in double quotes; escape inner " and \.
  const escaped = String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function serializeFrontmatter(fm) {
  const lines = ['---'];
  // 1. name (required, bare slug — safe characters).
  lines.push(`name: ${fm.name}`);
  // 2. description (always quoted).
  lines.push(`description: ${quoteYamlString(fm.description || '')}`);
  // 3. tools (comma-separated string, parity with existing agents/skills).
  const toolsList = Array.isArray(fm.tools) ? fm.tools : [];
  lines.push(`tools: ${toolsList.join(', ')}`);
  // 4. default-tier.
  lines.push(`default-tier: ${fm['default-tier'] || 'sonnet'}`);
  // 5. reasoning-class — omit if undefined.
  if (fm['reasoning-class'] !== undefined) {
    lines.push(`reasoning-class: ${fm['reasoning-class']}`);
  }
  // 6. parallel-safe — omit if undefined.
  if (fm['parallel-safe'] !== undefined) {
    lines.push(`parallel-safe: ${fm['parallel-safe']}`);
  }
  // 7. reads-only — omit if undefined.
  if (fm['reads-only'] !== undefined) {
    lines.push(`reads-only: ${fm['reads-only']}`);
  }
  // 8. delegate_to: null — ALWAYS last, ALWAYS present (D-12).
  lines.push(`delegate_to: null`);
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// -------------------------------------------------------------------
// Scoped writer (D-05 floor)
// -------------------------------------------------------------------

function safeWritePath(slug, kind, incubatorRoot) {
  const root = incubatorRoot || INCUBATOR_ROOT;
  const rootResolved = path.resolve(root);
  const targetDir = path.resolve(rootResolved, slug);
  const targetFile = kind === 'skill'
    ? path.resolve(targetDir, 'SKILL.md')
    : path.resolve(targetDir, 'agents', `${slug}.md`);

  const relFromRoot = path.relative(rootResolved, targetFile);
  if (
    !relFromRoot
    || relFromRoot.startsWith('..')
    || relFromRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relFromRoot)
  ) {
    throw new Error(`incubator_path_escape: ${slug}`);
  }
  const writeDir = kind === 'skill'
    ? targetDir
    : path.resolve(targetDir, 'agents');
  return { targetDir: writeDir, targetFile };
}

// -------------------------------------------------------------------
// Existing-artifact loader (similarity guard input)
// -------------------------------------------------------------------

function parseFrontmatterBlock(content) {
  // Minimal YAML-frontmatter parser: lines between leading `---` markers.
  // Tolerates missing/malformed blocks — returns empty {} when uncertain.
  if (typeof content !== 'string' || !content.startsWith('---')) return {};
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx < 0) return {};
  const block = content.slice(3, endIdx).trim();
  const fm = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (key === 'tools') {
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else {
        val = val.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    fm[key] = val;
  }
  return fm;
}

function loadExistingArtifacts(repoRoot) {
  const root = repoRoot || process.cwd();
  const incubatorAbs = path.resolve(root, INCUBATOR_ROOT);
  const results = [];

  // agents/*.md
  const agentsDir = path.join(root, 'agents');
  if (fs.existsSync(agentsDir)) {
    let entries = [];
    try { entries = fs.readdirSync(agentsDir, { withFileTypes: true }); } catch (_e) { entries = []; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      const abs = path.join(agentsDir, entry.name);
      // Exclude anything inside the incubator subtree (paranoia; agents/ should not contain it).
      if (abs.startsWith(incubatorAbs)) continue;
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch (_e) { continue; }
      const fm = parseFrontmatterBlock(content);
      results.push({ path: path.relative(root, abs).replace(/\\/g, '/'), frontmatter: fm });
    }
  }

  // skills/*/SKILL.md
  const skillsDir = path.join(root, 'skills');
  if (fs.existsSync(skillsDir)) {
    let entries = [];
    try { entries = fs.readdirSync(skillsDir, { withFileTypes: true }); } catch (_e) { entries = []; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const abs = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(abs)) continue;
      if (abs.startsWith(incubatorAbs)) continue;
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch (_e) { continue; }
      const fm = parseFrontmatterBlock(content);
      results.push({ path: path.relative(root, abs).replace(/\\/g, '/'), frontmatter: fm });
    }
  }

  return results;
}

// -------------------------------------------------------------------
// Main entrypoint
// -------------------------------------------------------------------

function draftClusters(input, options) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.clusters)) {
    throw new Error('invalid_input: clusters must be array');
  }
  const opts = options || {};
  const stabilityK = opts.stabilityK != null ? opts.stabilityK : DEFAULT_STABILITY_K;
  const stddevThreshold = opts.stddevThreshold != null ? opts.stddevThreshold : DEFAULT_STDDEV_THRESHOLD;
  const similarityThreshold = opts.similarityThreshold != null ? opts.similarityThreshold : DEFAULT_SIMILARITY_THRESHOLD;
  const fallbackTools = Array.isArray(opts.fallbackTools) && opts.fallbackTools.length
    ? opts.fallbackTools
    : Array.from(DEFAULT_FALLBACK_TOOLS);
  const incubatorRoot = opts.incubatorRoot || INCUBATOR_ROOT;
  const dryRun = Boolean(opts.dryRun);
  const now = opts.now || new Date().toISOString();

  const existingArtifacts = Array.isArray(opts.existingArtifacts)
    ? opts.existingArtifacts
    : loadExistingArtifacts(opts.repoRoot || process.cwd());

  // Seed the running slug set with existing names to avoid promotion collisions.
  const existingSlugs = new Set();
  for (const art of existingArtifacts) {
    if (art && art.frontmatter && typeof art.frontmatter.name === 'string') {
      existingSlugs.add(art.frontmatter.name);
    }
  }

  // Stable iteration order: clusters sorted by cluster_id ascending.
  const clusters = input.clusters.slice().sort((a, b) => {
    const ai = (a && a.cluster_id) || '';
    const bi = (b && b.cluster_id) || '';
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });

  const drafts = [];
  const skipped = [];
  const deferred = [];

  for (const cluster of clusters) {
    const clusterId = (cluster && cluster.cluster_id) || '(unknown)';

    // Gate A — stability (size).
    if (!cluster || typeof cluster.size !== 'number' || cluster.size < stabilityK) {
      skipped.push({
        cluster_id: clusterId,
        reason: 'below_stability_threshold',
        gate: { size: (cluster && cluster.size) || 0, threshold: stabilityK },
      });
      continue;
    }
    // Gate B — stability (stddev).
    const postStddev = cluster.posterior && typeof cluster.posterior.stddev === 'number'
      ? cluster.posterior.stddev
      : null;
    if (postStddev == null || postStddev >= stddevThreshold) {
      skipped.push({
        cluster_id: clusterId,
        reason: 'posterior_stddev_too_wide',
        gate: { stddev: postStddev, threshold: stddevThreshold },
      });
      continue;
    }
    // Gate C — suggested_kind.
    const kind = cluster.suggested_kind;
    if (kind !== 'skill' && kind !== 'agent') {
      skipped.push({
        cluster_id: clusterId,
        reason: 'wrong_suggested_kind',
        gate: { suggested_kind: kind },
      });
      continue;
    }

    // Inference passes.
    const inferredTools = inferTools(cluster, fallbackTools);
    const descObj = buildDescription(cluster);
    const tierObj = inferDefaultTier(cluster, opts, existingArtifacts);
    const slug = deriveSlug(cluster.intent_summary || '', existingSlugs);

    // Gate D — similarity (D-09).
    const probe = { slug, inferredTools, description: descObj.description };
    const nearest = computeSimilarity(probe, existingArtifacts);
    if (nearest && nearest.score >= similarityThreshold) {
      deferred.push({
        cluster_id: clusterId,
        slug,
        reason: 'similarity_to_existing',
        nearest,
        forward_to: 'phase_11_frontmatter_update',
      });
      // Do NOT register this slug; the cluster never got drafted, no collision risk for siblings.
      continue;
    }

    // Reads-only inference: only reading-style tools.
    const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash']);
    const readsOnly = inferredTools.every((t) => READING_TOOLS.has(t));
    const parallelSafe = readsOnly; // default true when reads-only

    // Frontmatter object (deterministic field order via serializeFrontmatter).
    const frontmatter = {
      name: slug,
      description: descObj.description,
      tools: inferredTools,
      'default-tier': tierObj.tier,
      'parallel-safe': parallelSafe,
      'reads-only': readsOnly,
      delegate_to: null,
    };
    // Attach slug onto cluster for body renderer (transient).
    cluster.__slug = slug;
    const body = renderOrigin(cluster, { stabilityK, stddevThreshold }, now);
    delete cluster.__slug;

    const fileContent = serializeFrontmatter(frontmatter) + body;

    // Scoped path resolution + optional write.
    let resolved;
    try {
      resolved = safeWritePath(slug, kind, incubatorRoot);
    } catch (err) {
      // Propagate path-escape errors — caller's contract is fail-loud on injection.
      throw err;
    }

    if (!dryRun) {
      fs.mkdirSync(resolved.targetDir, { recursive: true });
      fs.writeFileSync(resolved.targetFile, fileContent, 'utf8');
    }

    const recordedPath = path.relative(process.cwd(), resolved.targetFile).replace(/\\/g, '/');
    drafts.push({
      cluster_id: clusterId,
      slug,
      kind,
      path: recordedPath,
      frontmatter,
      body,
      written: !dryRun,
      inference: {
        slug_source: 'intent_summary',
        tools_source: (Array.isArray(cluster.trajectory_refs) && cluster.trajectory_refs.some((t) => t && Array.isArray(t.tools) && t.tools.length))
          ? 'trajectory_observed'
          : (Array.isArray(cluster.observed_tools) && cluster.observed_tools.length ? 'cluster.observed_tools' : 'fallback'),
        default_tier_source: tierObj.source,
        description_truncated: descObj.truncated,
      },
    });

    // Reserve the slug so subsequent clusters in this call won't collide.
    existingSlugs.add(slug);
  }

  return { drafts, skipped, deferred };
}

// -------------------------------------------------------------------
// Exports
// -------------------------------------------------------------------

module.exports = {
  draftClusters,
  computeSimilarity,
  deriveSlug,
  inferTools,
  inferDefaultTier,
  buildDescription,
  renderOrigin,
  serializeFrontmatter,
  safeWritePath,
  loadExistingArtifacts,
  tokenize,
  cosineSim,
  jaccard,
  levenshteinNormalized,
  DEFAULT_STABILITY_K,
  DEFAULT_STDDEV_THRESHOLD,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_FALLBACK_TOOLS,
  INCUBATOR_ROOT,
  DESCRIPTION_SOFT_CAP,
  TIERS,
};
