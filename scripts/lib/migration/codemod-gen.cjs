'use strict';
/**
 * scripts/lib/migration/codemod-gen.cjs — Phase 39.1 codemod template generator.
 *
 * Pure + dep-free (D-02): zero `require`. Given a migration rule from a
 * reference/migrations/<ds>.md rule library, emit a STARTING-POINT codemod template (jscodeshift
 * or ast-grep) that the USER reviews + runs with their own tool — GDD never imports or runs
 * jscodeshift / ast-grep, and never auto-applies (D-01). Deterministic: same rule → same template
 * (hermetic tests). The template is a scaffold the user adapts, not a guaranteed-correct transform.
 *
 * Rule shape: { id, kind, from, to, note? }
 *   kind ∈ 'rename-class' | 'rename-prop' | 'remove-component' | 'token-rename' | 'new-default'
 */

const KINDS = ['rename-class', 'rename-prop', 'remove-component', 'token-rename', 'new-default'];

const esc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const reEsc = (s) => String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function jscodeshift(rule) {
  const { id, kind, from, to, note } = rule;
  const head = `// codemod ${id} (${kind}) — review before running: jscodeshift -t ${id}.js <path>\n` +
    `// ${note ? note.replace(/\n/g, ' ') : `${from} -> ${to}`}\nmodule.exports = function (file, api) {\n  const j = api.jscodeshift;\n  const root = j(file.source);\n`;
  const tail = `\n  return root.toSource();\n};\n`;
  switch (kind) {
    case 'rename-prop':
      return head + `  root.find(j.JSXAttribute, { name: { name: '${esc(from)}' } })\n    .forEach((p) => { p.node.name.name = '${esc(to)}'; });` + tail;
    case 'remove-component':
      return head + `  // '${esc(from)}' is removed in the target version${to ? ` (use '${esc(to)}')` : ''}.\n` +
        `  root.findJSXElements('${esc(from)}').forEach((p) => {\n    j(p).insertBefore(j.commentLine(' TODO(${id}): migrate <${esc(from)}>${to ? ` -> <${esc(to)}>` : ''}'));\n  });` + tail;
    case 'rename-class':
    case 'token-rename':
      return head + `  // replace the ${kind === 'rename-class' ? 'class' : 'token'} '${esc(from)}' -> '${esc(to)}' in string/template literals\n` +
        `  const RE = /\\b${reEsc(from)}\\b/g;\n` +
        `  root.find(j.Literal).filter((p) => typeof p.node.value === 'string' && RE.test(p.node.value))\n    .forEach((p) => { p.node.value = p.node.value.replace(RE, '${esc(to)}'); });\n` +
        `  root.find(j.TemplateElement).filter((p) => p.node.value && RE.test(p.node.value.raw))\n    .forEach((p) => { const v = p.node.value.raw.replace(RE, '${esc(to)}'); p.node.value = { raw: v, cooked: v }; });` + tail;
    case 'new-default':
      return `// codemod ${id} (new-default) — NO automatic transform.\n` +
        `// A default changed (${from || '—'} -> ${to || '—'}). Manual review required: ${note ? note.replace(/\n/g, ' ') : 'audit affected usages + restore the old default explicitly if needed.'}\n` +
        `module.exports = function (file) { return file.source; };\n`;
    default:
      throw new RangeError(`codemod-gen: unknown kind '${kind}' (expected one of ${KINDS.join(', ')})`);
  }
}

function astGrep(rule) {
  const { id, kind, from, to, note } = rule;
  const header = `# codemod ${id} (${kind}) — review before running: ast-grep scan -r ${id}.yml\n# ${note ? note.replace(/\n/g, ' ') : `${from} -> ${to}`}\nid: ${id}\nlanguage: tsx\n`;
  switch (kind) {
    case 'rename-prop':
      return header + `rule:\n  pattern: ${from}=$VAL\nfix: ${to}=$VAL\n`;
    case 'remove-component':
      return header + `rule:\n  pattern: <${from} $$$PROPS />\n# '${from}' removed${to ? ` — migrate to <${to}>` : ''}; no auto-fix (manual)\n`;
    case 'rename-class':
    case 'token-rename':
      return header + `rule:\n  regex: '\\b${reEsc(from)}\\b'\nfix: '${to}'\n`;
    case 'new-default':
      return header + `# NO auto-fix — a default changed (${from || '—'} -> ${to || '—'}); manual review.\nrule:\n  pattern: $X\nconstraints: {}\n`;
    default:
      throw new RangeError(`codemod-gen: unknown kind '${kind}' (expected one of ${KINDS.join(', ')})`);
  }
}

/** emitCodemod(rule, { engine }) → { ruleId, engine, kind, template }. */
function emitCodemod(rule, opts = {}) {
  if (!rule || typeof rule !== 'object') throw new TypeError('emitCodemod: rule object required');
  if (!KINDS.includes(rule.kind)) throw new RangeError(`emitCodemod: invalid kind '${rule.kind}'`);
  const engine = opts.engine || 'jscodeshift';
  if (engine !== 'jscodeshift' && engine !== 'ast-grep') throw new RangeError(`emitCodemod: engine must be jscodeshift|ast-grep`);
  const template = engine === 'jscodeshift' ? jscodeshift(rule) : astGrep(rule);
  return { ruleId: rule.id, engine, kind: rule.kind, template };
}

module.exports = { emitCodemod, KINDS };
