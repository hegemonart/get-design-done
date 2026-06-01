'use strict';
// Phase 40 — permissions.cjs — PURE, dep-free section-write permission model (SC#10).
//
// `.design/config.json#permissions` declares who may perform which action on which STATE.md section.
// The model is permissive-by-default (single-operator projects are unaffected): with no `permissions`
// block, everyone is an `owner` and `can(...)` is always true. A team narrows it, e.g. "only
// @lead-designer can `lock` decisions". A CI gate calls `can()` to enforce on PRs.
//
// Shape of config.permissions:
//   {
//     "default": "owner",                     // role for any actor not listed
//     "actors": { "@alice": "reviewer", ... },// per-actor role
//     "rules": [ { "section": "decisions", "action": "lock", "roles": ["owner"] }, ... ]
//   }
// A rule restricts (section, action) to the listed roles. No matching rule ⇒ allowed (permissive).
//
// No `require` — pure. Deterministic.

const SECTIONS = Object.freeze(['decisions', 'prototyping', 'rollout_status', 'status', 'progress', 'blockers']);
const ACTIONS = Object.freeze(['write', 'lock', 'unlock', 'approve']);
const ROLES = Object.freeze(['owner', 'contributor', 'reviewer', 'viewer']);

/** The role assigned to `actor` by the config (falls back to config.default, then 'owner'). */
function roleOf(config, actor) {
  const perms = (config && config.permissions) || {};
  const actors = perms.actors || {};
  if (actor && Object.prototype.hasOwnProperty.call(actors, actor)) return actors[actor];
  return perms.default || 'owner';
}

/**
 * May `actor` perform `action` on `section` under this config?
 * Permissive by default: a (section, action) with no matching rule is allowed. A matching rule
 * allows only its listed roles. `viewer` is denied any mutating action even absent a rule.
 */
function can(config, actor, section, action) {
  const role = roleOf(config, actor);
  if (role === 'viewer') return false; // viewers never mutate
  const perms = (config && config.permissions) || {};
  const rules = Array.isArray(perms.rules) ? perms.rules : [];
  const matching = rules.filter(
    (r) => r && (r.section === section || r.section === '*') && (r.action === action || r.action === '*'),
  );
  if (matching.length === 0) return true; // no restriction → allowed
  return matching.some((r) => Array.isArray(r.roles) && r.roles.includes(role));
}

/** The default permissive policy (used when config has no permissions block). */
function defaultPolicy() {
  return { default: 'owner', actors: {}, rules: [] };
}

module.exports = { SECTIONS, ACTIONS, ROLES, roleOf, can, defaultPolicy };
