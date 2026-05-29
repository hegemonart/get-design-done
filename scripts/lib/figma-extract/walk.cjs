'use strict';
/**
 * Plan 31-02 — productionized from spike 001 digest.mjs walk() + summarizeWidgets().
 *
 * Node-tree walker with VARIANT ROLLUP (decision D-02, variant rollup default-on).
 *
 * The spike proved a naive walk inflates the component count ~16× (2,593 vs 167
 * entries) because each COMPONENT_SET's variant children are counted as separate
 * components. The fix — locked here as the non-optional default — is to SKIP the
 * COMPONENT children of a COMPONENT_SET and record their names as a `variants[]`
 * field on the parent set. A COMPONENT_SET with N variant children therefore
 * yields exactly ONE component entry, not N (+1).
 *
 * Pure CommonJS, no external deps, no I/O, no network.
 *
 * Exports:
 *   walkDocument(node, ctx, parentIsSet)  — low-level recursive helper (unit-testable)
 *   collectComponents(documentNode)       — top-level entry over file.document
 */

/**
 * Recursive tree walker. Mutates `ctx` in place.
 *
 * @param {object|null|undefined} node          a Figma node (document/canvas/frame/component/…)
 * @param {{components:Array, widgets:Array, depth:number}} ctx accumulator
 * @param {boolean} [parentIsSet=false]         true when the parent node is a COMPONENT_SET
 */
function walkDocument(node, ctx, parentIsSet = false) {
  if (!node) return;

  // Rollup core: a COMPONENT is only a standalone component when its parent is
  // NOT a COMPONENT_SET. COMPONENT children of a set are variants — skipped here
  // (they are recorded as variants[] on the parent set below).
  const isStandaloneComponent = node.type === 'COMPONENT' && !parentIsSet;

  if (node.type === 'COMPONENT_SET' || isStandaloneComponent) {
    ctx.components.push({
      id: node.id,
      name: node.name,
      type: node.type,
      description: node.description || '',
      // Variant names live on the set's children; standalone components have none.
      variants:
        node.type === 'COMPONENT_SET'
          ? (node.children || []).map((c) => c.name)
          : undefined,
      // componentPropertyDefinitions → flattened props. Figma suffixes prop keys
      // with '#<id>' for uniqueness; strip it for the human-facing name.
      props: node.componentPropertyDefinitions
        ? Object.entries(node.componentPropertyDefinitions).map(([k, v]) => ({
            name: k.split('#')[0],
            type: v.type,
            default: v.defaultValue,
            options: v.variantOptions,
          }))
        : undefined,
    });
  }

  // Top-level FRAMEs (depth 1 — direct children of a page/canvas) are widget /
  // page candidates for downstream classification.
  if (ctx.depth === 1 && node.type === 'FRAME') {
    ctx.widgets.push({ id: node.id, name: node.name });
  }

  if (node.children) {
    ctx.depth++;
    // Children of a COMPONENT_SET are variants — flag so they are not re-pushed.
    const childParentIsSet = node.type === 'COMPONENT_SET';
    for (const child of node.children) walkDocument(child, ctx, childParentIsSet);
    ctx.depth--;
  }
}

/**
 * Collect components (with variant rollup) and top-level frames from a document.
 *
 * @param {object} documentNode  file.document — has .children = pages (CANVAS nodes)
 * @returns {{components:Array, widgets:Array}}
 *   components: Array<{ id, name, type:'COMPONENT_SET'|'COMPONENT', description,
 *                       variants?:string[], props?:Array<{name,type,default,options}> }>
 *   widgets:    Array<{ id, name }>  — top-level FRAMEs (depth 1)
 */
function collectComponents(documentNode) {
  const ctx = { components: [], widgets: [], depth: 0 };
  if (!documentNode || !documentNode.children) {
    return { components: ctx.components, widgets: ctx.widgets };
  }
  // Pages (CANVAS) sit at depth 0; their children are depth 1 — that's where
  // top-level frames become widget candidates. Mirror the spike's depth handling
  // by entering each page's children at depth 1.
  for (const page of documentNode.children) {
    if (!page || !page.children) continue;
    ctx.depth = 1;
    for (const child of page.children) walkDocument(child, ctx, false);
  }
  return { components: ctx.components, widgets: ctx.widgets };
}

module.exports = { walkDocument, collectComponents };
