// PLACEHOLDER — replaced by Plan 31-05.
//
// This is a compiling stub so the 31-04 scaffold (code.ts) builds standalone in
// Wave B.1. Plan 31-05 replaces this file with the real Path C export logic:
//   - reads figma.variables.getLocalVariableCollectionsAsync() + getLocalVariablesAsync()
//   - emits ALL local variables (decision D-13), resolves aliases, includes mode metadata
//   - builds a payload conforming to the receiver's payload-schema.json (Plan 31-06)
//   - POSTs it to http://localhost:5179/variables (matches manifest.allowedDomains, D-06)
//
// Contract 31-05 MUST preserve: export an async `exportVariables(): Promise<void>`
// that code.ts can call on the { type: 'export' } message. 31-05 may also add and
// export buildPayload() and a src/payload-schema.ts under the same tsconfig.

export async function exportVariables(): Promise<void> {
  figma.notify('GDD Sync: export-variables not yet implemented (scaffold placeholder — Plan 31-05).');
}
