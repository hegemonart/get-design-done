'use strict';
// Phase 40 — attribution.cjs — PURE, dep-free parser/formatter for multi-author decision attribution.
//
// A STATE.md decision line carries an OPTIONAL attribution suffix so multiple developers' decisions
// survive a merge with provenance intact (SC#5). The canonical line form is:
//
//   D-NN: <text> (<status>) [author=<git-user> co-author=<gdd-instance-id>]
//
// The suffix is optional and backward-compatible — a plain `D-01: text (locked)` parses with
// author/coAuthor = null. This module does ONLY string parse/format + grouping; no fs, no clock.
//
// No `require` — pure. Deterministic.

const STATUSES = Object.freeze(['locked', 'tentative']);

/**
 * Parse a single decision line into its parts. Returns null when the line is not a decision line.
 * @returns {{id, text, status, author, coAuthor} | null}
 */
function parseDecisionLine(line) {
  const s = String(line).trim().replace(/^[-*]\s+/, ''); // tolerate list-bullet prefixes
  const m = s.match(/^(D-\d+)\s*:\s*(.*)$/);
  if (!m) return null;
  const id = m[1];
  let rest = m[2].trim();
  let author = null;
  let coAuthor = null;
  // Pull a trailing [author=... co-author=...] suffix (order-independent, both optional).
  const attr = rest.match(/\[([^\]]*)\]\s*$/);
  if (attr) {
    const inner = attr[1];
    const am = inner.match(/\bauthor=([^\s\]]+)/);
    const cm = inner.match(/\bco-author=([^\s\]]+)/);
    if (am) author = am[1];
    if (cm) coAuthor = cm[1];
    if (am || cm) rest = rest.slice(0, attr.index).trim();
  }
  // Pull a trailing (status).
  let status = null;
  const st = rest.match(/\(([a-z]+)\)\s*$/i);
  if (st && STATUSES.includes(st[1].toLowerCase())) {
    status = st[1].toLowerCase();
    rest = rest.slice(0, st.index).trim();
  }
  return { id, text: rest, status, author, coAuthor };
}

/** Format a decision object back into the canonical line (omitting absent optional parts). */
function formatDecisionLine(d) {
  if (!d || !d.id) throw new Error('attribution: formatDecisionLine needs {id}');
  let line = `${d.id}: ${String(d.text || '').trim()}`;
  if (d.status) line += ` (${d.status})`;
  const bits = [];
  if (d.author) bits.push(`author=${d.author}`);
  if (d.coAuthor) bits.push(`co-author=${d.coAuthor}`);
  if (bits.length) line += ` [${bits.join(' ')}]`;
  return line;
}

/** Group an array of decision objects by author → { '<author>': [decision,...], '<unattributed>': [...] }. */
function groupByAuthor(decisions) {
  if (!Array.isArray(decisions)) throw new Error('attribution: groupByAuthor needs an array');
  const out = {};
  for (const d of decisions) {
    const key = d && d.author ? d.author : '<unattributed>';
    (out[key] = out[key] || []).push(d);
  }
  return out;
}

/** Parse a whole `<decisions>` block body into decision objects (skips blanks/comments). */
function parseDecisionsBlock(body) {
  const out = [];
  for (const line of String(body).replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('<!--')) continue;
    const d = parseDecisionLine(t);
    if (d) out.push(d);
  }
  return out;
}

module.exports = { STATUSES, parseDecisionLine, formatDecisionLine, groupByAuthor, parseDecisionsBlock };
