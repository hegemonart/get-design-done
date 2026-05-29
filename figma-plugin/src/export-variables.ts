// figma-plugin/src/export-variables.ts — Plan 31-05 (Wave B.2)
//
// Path C of the three-path token extraction (D-04). The Variables REST API is
// Enterprise-only (the spike hit a 403); the in-Figma sandbox Variables API
// (figma.variables.*) works on ANY plan. This module reads the local variable
// collections + variables from inside Figma, resolves aliases, includes mode
// metadata, emits ALL local variables (D-13 — no published filter), builds a
// payload conforming to the receiver's payload-schema.json (31-06), and POSTs it
// to the ephemeral localhost receiver (D-06: 127.0.0.1:5179 ONLY).
//
// Replaces the 31-04 placeholder. Contract preserved: `export async function
// exportVariables(): Promise<void>` is what code.ts calls on the { type:'export' }
// message. The PURE builder (buildPayload, re-exported from ./payload-schema) is
// kept network-free so the offline test drives it against a figma.variables mock.
//
// Reading strategy: the async API (getLocalVariableCollectionsAsync /
// getLocalVariablesAsync / getVariableByIdAsync) is used rather than the
// deprecated sync variants — the sync methods throw under
// `"documentAccess":"dynamic-page"` manifests, and async is the documented,
// future-proof surface. The pure buildPayload stays synchronous so the data
// gathering (async, Figma-bound) and the shaping (sync, testable) are separated.

import {
  buildPayload,
  type GddSyncPayload,
  type RawCollectionLike,
  type RawVariableLike,
  type VariableNameResolver,
} from './payload-schema';

// Re-export the pure builder + payload type so code.ts / tests have one import
// site for the plugin-side contract.
export {
  buildPayload,
  isGddSyncPayload,
  type GddSyncPayload,
} from './payload-schema';

// D-06: the ONE permitted network destination. Matches the receiver's bind host
// (127.0.0.1 — receiver.cjs RECEIVER_HOST) and manifest.networkAccess.allowedDomains.
// Using the explicit loopback IP (not `localhost`) avoids any IPv6 `::1`
// resolution surprise and matches the receiver's 127.0.0.1 bind exactly.
export const RECEIVER_URL = 'http://127.0.0.1:5179/variables';

/**
 * Read local collections + variables from the Figma sandbox and shape them into
 * a GddSyncPayload via the pure buildPayload. Async because the non-deprecated
 * Variables API is async. Emits ALL local variables (D-13). Alias targets are
 * resolved to names (via getVariableByIdAsync) so the digest can render the
 * alias chain like the spike's `{alias}` form.
 *
 * Separated from exportVariables() so the network POST is the only impure part.
 */
export async function gatherPayload(): Promise<GddSyncPayload> {
  // getLocalVariableCollectionsAsync(): VariableCollection[] — { id, name, modes:[{modeId,name}] }
  const rawCollections = await figma.variables.getLocalVariableCollectionsAsync();
  // getLocalVariablesAsync(): Variable[] — ALL locals (D-13; no type filter).
  const rawVariables = await figma.variables.getLocalVariablesAsync();

  const collections: RawCollectionLike[] = rawCollections.map((c) => ({
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
  }));

  const variables: RawVariableLike[] = rawVariables.map((v) => ({
    id: v.id,
    name: v.name,
    resolvedType: v.resolvedType,
    variableCollectionId: v.variableCollectionId,
    // valuesByMode is { [modeId]: VariableValue }; pass through — buildPayload
    // resolves alias markers + renders the flat tokens[].
    valuesByMode: v.valuesByMode as RawVariableLike['valuesByMode'],
  }));

  // Pre-resolve every alias target name once (async), then hand buildPayload a
  // synchronous resolver. We gather the set of alias target ids first to avoid
  // N awaits inside the pure builder.
  const aliasIds = new Set<string>();
  for (const v of rawVariables) {
    for (const modeId of Object.keys(v.valuesByMode)) {
      const value = v.valuesByMode[modeId] as unknown;
      if (
        value &&
        typeof value === 'object' &&
        (value as { type?: string }).type === 'VARIABLE_ALIAS' &&
        typeof (value as { id?: string }).id === 'string'
      ) {
        aliasIds.add((value as { id: string }).id);
      }
    }
  }

  const nameById = new Map<string, string>();
  for (const id of aliasIds) {
    try {
      const target = await figma.variables.getVariableByIdAsync(id);
      if (target) nameById.set(id, target.name);
    } catch {
      // A missing/unreadable alias target is non-fatal — buildPayload falls back
      // to `{id}` so the reference is still recorded.
    }
  }
  const resolveName: VariableNameResolver = (id) => nameById.get(id);

  return buildPayload(collections, variables, {
    fileKey: figma.fileKey,
    exportedAt: new Date().toISOString(),
    resolveName,
  });
}

/**
 * The export entry point code.ts calls on the { type:'export' } message. Builds
 * the payload then POSTs it to the receiver. Network failures + non-2xx
 * responses are surfaced via figma.notify and NEVER crash the sandbox.
 */
export async function exportVariables(): Promise<void> {
  let payload: GddSyncPayload;
  try {
    payload = await gatherPayload();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    figma.notify('GDD Sync: failed to read variables — ' + msg);
    return;
  }

  try {
    const res = await fetch(RECEIVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      figma.notify('GDD Sync: receiver rejected payload (' + res.status + ')');
    } else {
      figma.notify('GDD Sync: exported ' + payload.variables.length + ' variables');
    }
  } catch {
    // No receiver listening (the common case when no extract run is active),
    // or any other network error. Guide the user; do not throw.
    figma.notify('GDD Sync: no receiver on 127.0.0.1:5179 — start a GDD extract run first');
  }
}
