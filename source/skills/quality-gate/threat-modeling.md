---
name: threat-modeling
type: heuristic
version: 1.0.0
phase: 28.5
tags: [threat-modeling, stride, audit, security, trust-boundary, disposition]
last_updated: 2026-05-18
---

# Threat Modeling

Audit-side STRIDE / threat-modeling reference. Centralizes the categories, trust-boundary
identification heuristics, and disposition framework (mitigate / accept / transfer) so
consumer skills can cross-link rather than inline. Extracted as part of Phase 28.5 from
inline content in `skills/quality-gate/SKILL.md` (the four-tier classification) and the
shared verifier / audit family. See `./audit-scoring.md` for the design-side scoring
framework, which uses STRIDE as one of its lenses.

## When to use

Apply STRIDE during:

- **Verify entry** (Stage 5) when the changeset touches a trust boundary (auth, ingress,
  deserialization, subprocess spawn).
- **Audit pillar runs** when a heuristic flags potential security surface.
- **Plan-phase risk-register population** when the plan touches user input, network
  endpoints, file IO from user paths, or persisted state.
- **Threat register on plans that ship new endpoints** — assign one of {mitigate, accept,
  transfer} to every identified threat before the plan ships.

## STRIDE categories

| Letter | Threat                  | Audit lens                                         |
|--------|-------------------------|----------------------------------------------------|
| S      | Spoofing                | Auth surfaces — login, session, token issuance     |
| T      | Tampering               | Data integrity — write paths, persisted state      |
| R      | Repudiation             | Audit trails / logging — proof of action           |
| I      | Information Disclosure  | PII / secret leakage — logs, errors, side channels |
| D      | Denial of Service       | Resource exhaustion — unbounded loops, large reads |
| E      | Elevation of Privilege  | AuthZ bypass — role checks, capability tokens      |

## Trust boundaries

A trust boundary is a point where untrusted input crosses into trusted code. Identify
trust boundaries before applying STRIDE — each boundary is one analysis sweep.

Identification heuristics:

- **Network ingress** — HTTP, gRPC, WebSocket, MCP transport, any TCP/UDP listen socket.
- **File reads from user-writable paths** — uploads, `$HOME` configs, user-supplied paths
  from CLI args, drag-drop.
- **Subprocess spawns with user-supplied args** — `exec`/`spawn` where any argv element
  is reachable from user input (URL params, env vars, config keys).
- **Deserialization of persisted format** — JSON, YAML, MsgPack, Protobuf, custom
  formats. The deserializer is the boundary, regardless of where the bytes came from.
- **Third-party SDK callouts** — when gdd hands data to a peer-CLI, the data leaves the
  trust boundary; treat the return path as untrusted on re-entry.

## Disposition framework

Every identified threat MUST carry a disposition before the plan ships. Three values:

| Disposition | When to use                                                                  |
|-------------|------------------------------------------------------------------------------|
| Mitigate    | Threat has both impact and likelihood; ASVS L1 requires the control. Build  |
|             | the control as part of the plan; cite the test that proves it.               |
| Accept      | Low impact AND low likelihood. Documented rationale in the threat register;  |
|             | no code change required. Re-visit if the threat-surface scope grows.         |
| Transfer    | Third-party owns the control surface (e.g., the OS, the runtime, a peer's   |
|             | sandbox). Document the boundary; do not re-implement the control.            |

Mitigations on Plan tasks are correctness requirements — the executor applies Rule 2
(missing critical functionality) if a mitigation disposition is present but the
implementation lacks the control.

## Threat register schema

When a plan carries a `<threat_model>` block in its frontmatter, each entry follows:

```yaml
- id: T-01
  category: spoofing       # S, T, R, I, D, or E
  surface: auth/login      # path or component the threat hits
  description: "<one-line description>"
  disposition: mitigate    # mitigate, accept, or transfer
  control: "rate-limit + ASVS V2.2.1 password policy"   # required when mitigate
  rationale: "<why accept/transfer>"                    # required when accept/transfer
```

Multiple threats per plan are normal. The disposition column is the load-bearing field —
the executor scans it; the verifier scans it.

## Cross-references

- `./audit-scoring.md` — design-side audit-scoring rubric; STRIDE is one of its lenses.
- `./anti-patterns.md` — concrete anti-patterns mapped to STRIDE categories where
  applicable (e.g., `eval`-on-user-input → Tampering + EoP).
- `./accessibility.md` — accessibility is the orthogonal lens; threat-modeling does not
  cover it.
- ASVS (OWASP Application Security Verification Standard) — external authority for the
  control catalog. Cited in plan threat-registers as `ASVS V<chapter>.<section>`.
