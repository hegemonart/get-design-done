'use strict';
/**
 * probe-optional.cjs — safely require optional native dependencies.
 *
 * Usage:
 *   const { probeOptional } = require('./probe-optional.cjs');
 *   const Database = probeOptional('better-sqlite3');
 *   if (Database) { ... } else { // fallback }
 *
 * Returns the module if available and natively compatible, null otherwise.
 * Swallows MODULE_NOT_FOUND and native binding errors silently — callers
 * must implement their own fallback path.
 */
function probeOptional(name) {
  try {
    return require(name);
  } catch (e) {
    if (
      e.code === 'MODULE_NOT_FOUND' ||
      e.message?.includes('was compiled against a different Node.js version') ||
      e.message?.includes('NODE_MODULE_VERSION')
    ) {
      return null;
    }
    throw e;
  }
}

module.exports = { probeOptional };
