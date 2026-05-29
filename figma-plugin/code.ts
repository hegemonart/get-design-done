// GDD Sync — Figma plugin sandbox entry (main thread).
//
// SCAFFOLD (Plan 31-04): this is the shell only. It opens the single-button UI
// (ui.html) and wires the message plumbing that routes the "export" action to
// exportVariables(). The actual variables-read + POST logic lives in
// ./src/export-variables (a compiling PLACEHOLDER in this plan; Plan 31-05
// replaces it with the real implementation).
//
// Message contract (the seam 31-05 builds on):
//   ui.html  -- parent.postMessage({ pluginMessage: { type: 'export' } }) -->  code.ts
//   code.ts  -- figma.ui.onmessage receives { type: 'export' } --> exportVariables()
//   exportVariables() (31-05) reads figma.variables, builds the payload, and
//   POSTs it to http://localhost:5179/variables (the GDD receiver, Plan 31-06).
//
// Security: the only network destination the manifest permits is localhost:5179
// (manifest.networkAccess.allowedDomains, D-06). code.ts itself opens no sockets.

import { exportVariables } from './src/export-variables';

// Messages the UI may post to the sandbox. 31-05 may extend this union.
interface ExportMessage {
  type: 'export';
}

type UiMessage = ExportMessage;

figma.showUI(__html__, { width: 280, height: 160 });

figma.ui.onmessage = (msg: UiMessage): void => {
  if (msg && msg.type === 'export') {
    // Delegate to the export entry point. 31-05 supplies the real logic;
    // this scaffold ships a notify-only placeholder so code.ts compiles
    // standalone in Wave B.1.
    void exportVariables();
  }
};
