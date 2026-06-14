---
title: Pseudonymization Rules
phase: 30
type: meta-rules
status: stable
created: 2026-05-20
---

# Pseudonymization Rules

The 8 substitution rules applied by `scripts/lib/pseudonymize.cjs` to identity-correlatable content in Phase 30 issue payloads.

## Pseudonymization, not anonymization

These rules **reduce** identity correlation. They do not **eliminate** it. A determined adversary with side-channel data - writing style, code-style patterns, repository fingerprints, timing - may still re-identify a reporter. Phase 30 explicitly delivers pseudonymization-not-anonymization (CONTEXT D-01); over-promising would be misleading.

Pseudonymization here serves three concrete goals:

- **(a) Prevent casual identification** by other users who later read the public GitHub issue.
- **(b) Reduce corporate-DLP false-positives** at submission time on common identifier shapes (usernames in paths, hostnames in stack traces, email patterns in logs). The pseudonymized payload is less likely to be intercepted by enterprise DLP tools that scan for these exact patterns.
- **(c) Give the user a structural opportunity** to inspect and edit the payload before it leaves their machine. The pseudonymization step makes the payload's identity-correlation surface visible - the user can read it and decide.

Submission is always user-initiated and user-reviewed per Plan 30-04 (CONTEXT D-03). Phase 30 does **not** auto-submit, ever.

## Pipeline placement

Pseudonymization runs **after** redaction (`scripts/lib/redact.cjs`, Phase 22) in the Plan 30-02 payload assembly. The two are orthogonal:

| Layer | Module | What it scrubs |
|---|---|---|
| Secrets (high-stakes floor) | `scripts/lib/redact.cjs` | Tokens, API keys, JWTs, PEM blocks, AWS credentials, Slack/Stripe/GitHub tokens - strings that must **never** escape |
| Identity (privacy) | `scripts/lib/pseudonymize.cjs` | Names, paths, hostnames, repo origins, env-var values, emails, IPs - strings that **may** be published but should not personally identify the reporter |

Redaction handles "this string must never escape"; pseudonymization handles "this string is fine to publish but should not personally identify the reporter." The two modules do not import each other; composition lives at the caller (Plan 30-02 payload assembly). See CONTEXT D-01 for the framing rationale and CONTEXT references for the redaction prerequisite.

## The rules

Eight rules. Each rule has a stable id (R1..R8) used by `/hone:update --show-privacy-diff` (Plan 30-07) to enumerate active rules.

### R1 - git-identity

**Replaces:** `user.name` and `user.email` from git config when they appear in payload strings (stack traces, log messages, commit-author lines).

**Why:** The user's git identity is the most direct re-identification vector inside a payload. Substring matching is used for the name with a word-boundary guard (`\b`) so unrelated words containing the name as a substring (e.g., `alicewonderland` when the name is `alice`) are preserved. Email matching is case-insensitive.

**Before/after example:**
```
Author: alice <alice@example.com> committed at 12:34
Author: <user> <<user>@<domain>> committed at 12:34
```

**Coverage notes:** Word-boundary regex (`\b<name>\b`) prevents stripping unrelated substrings. Email match is case-insensitive (`alice@example.com` and `Alice@Example.Com` both replaced). Name values shorter than 2 chars and email values shorter than 3 chars are skipped to avoid over-eager matching on common short sequences.

### R2 - absolute-paths

**Replaces:** Home-directory absolute paths across all three OS conventions:

- Linux: `/home/<user>/...`
- macOS: `/Users/<user>/...`
- Windows: `C:\Users\<user>\...` (any drive letter)

**Why:** Issue payloads frequently include stack traces with absolute file paths. The path shape alone reveals the user's OS, and the username segment exposes identity. Critically: issue payloads from one OS may be processed on a maintainer's different OS, so the module handles all three shapes regardless of which OS the report was generated on.

**Before/after example:**
```
/home/alice/code/proj/file.ts:42  →  <home>/code/proj/file.ts:42
/Users/alice/code/proj/file.ts:42  →  <home>/code/proj/file.ts:42
C:\Users\alice\code\proj\file.ts:42  →  <home>\code\proj\file.ts:42
```

**Coverage notes:** Six regex sweeps - three identity-aware (when the name is known) and three generic (matching `/Users/<any>/`, `/home/<any>/`, `<drive>:\Users\<any>\`). Identity-aware sweeps run first so the identity-aware substitution takes precedence; generic sweeps catch references to teammates or other users that may appear in stack traces.

### R3 - hostname

**Replaces:** `os.hostname()` value with `<host>`.

**Why:** The machine hostname often encodes the user's name or organization (e.g., `alices-macbook.local`, `acme-corp-laptop-42`). Word-boundary substitution plus a special-case sweep for `@hostname` shapes inside ssh-like strings (where the standard `\b` lookaround does not fire as expected on `@`).

**Before/after example:**
```
Connected to alices-macbook.local from alices-macbook
Connected to <host>.local from <host>
```

**Coverage notes:** Two sweeps - one for `@hostname` (ssh-shape), one with standard word-boundary. Hostnames shorter than 2 chars are skipped.

### R4 - repo-origin

**Replaces:** Git origin URL with `<category>-hash:<sha8>` where:

- `<category>` is `public-personal-hash` when the caller's `opts.repoVisibility === 'public-personal'`
- `<category>` is `private-org-hash` for all other inputs (conservative default)
- `<sha8>` is `sha256(normalized_origin_url)[:8]` where normalization strips protocol prefixes (`git@github.com:`, `https://github.com/`, `ssh://`, `git://`) and trailing `.git`, then lowercases

**Why:** The repo URL identifies both the user and the organization. The hash gives maintainers a deterministic dedup key (same repo → same hash) without exposing the URL. The category prefix tells maintainers whether the reporter's repo is a personal public project or something more sensitive.

**Before/after example:**
```
Remote: git@github.com:acme-corp/internal-tools.git
Remote: private-org-hash:a1b2c3d4
```

**Coverage notes:** Caller resolves visibility via `gh repo view --json visibility` (or skips if `gh` is absent - module then uses the conservative `private-org-hash` default). The module performs no network calls; visibility is an injected `opts.repoVisibility` value. Owner-is-user vs owner-is-org distinction is the caller's responsibility (the module cannot tell from a URL alone). Both the raw `repoOrigin` substring and the normalized form are substituted so multiple shapes of the same URL in a stack trace all collapse to one placeholder.

### R5 - env-vars

**Replaces:** **VALUES** (not key names) of these environment variables wherever they appear in payload strings:

- `USER`, `LOGNAME`, `HOSTNAME` (POSIX identity)
- Any key ending in `_TOKEN`, `_KEY`, `_SECRET` (defense-in-depth alongside Phase 22 redaction)

**Why:** Phase 22's `redact.cjs` catches specific token shapes (`sk-ant-...`, `ghp_...`). R5 catches the residual case where an env-var value appears in a payload because the user interpolated it into a log message (e.g., `console.log('TOKEN=' + process.env.MY_KEY)`). The defense-in-depth catches custom org-specific keys that don't match the Phase 22 token-shape regex catalogue.

**Before/after example:**
```
Error: GITHUB_TOKEN=ghp_abcDEFghi123 was rejected
(with process.env.GITHUB_TOKEN === 'ghp_abcDEFghi123')

Error: GITHUB_TOKEN=<env:GITHUB_TOKEN> was rejected
```

**Coverage notes:** Empty / 1-char / 2-char values are skipped (corruption guard - short values would over-match unrelated content). Longer-value entries are processed first (descending by length) so a token that contains another's substring does not get half-replaced. R5 walks the entire payload tree (strings get value substitution, objects/arrays recurse, cycles detected via WeakSet) - value substitution works regardless of nesting depth.

### R6 - email-in-logs

**Replaces:** Email addresses that slipped past R1's identity-aware substitution (e.g., third-party emails mentioned in a stack trace or log line) with `<email>`.

**Why:** R1 catches the user's own `user.email`. R6 is the generic catch-all for any other email addresses that may appear in a payload - including teammates' emails in error messages, vendor support emails in stack traces, or addresses pulled from data being processed at the time of the error.

**Before/after example:**
```
Stack frame: at notify(maintainer@example.org)
Stack frame: at notify(<email>)
```

**Coverage notes:** Standard RFC-5322-ish regex (`/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g`). R6 runs **after** R1 in the rule pipeline so identity-aware substitution takes precedence (the user's email becomes `<user>@<domain>`, not `<email>`).

### R7 - ip-addresses

**Replaces:** IPv4 and IPv6 addresses, retaining only network class:

- IPv4 `a.b.c.d` → `<ipv4:a.b.c.0>` (zero out the last octet)
- IPv6 → `<ipv6:<prefix>::>` (drop the last segment)

**Why:** IP addresses reveal network topology and may identify the user's location, employer, or VPN egress. Retaining the network class (first three IPv4 octets, IPv6 prefix) preserves enough information for maintainer-side triage ("the error occurred over a corporate network") while dropping the specific host identifier.

**Before/after example:**
```
Failed to reach 203.0.113.42  →  Failed to reach <ipv4:203.0.113.0>
fe80::1ff:fe23:4567:890a       →  <ipv6:fe80::1ff:fe23:4567::>
```

**Coverage notes:** Regex guards prevent false-positives on:

- Semver strings (`v1.2.3.4`) - leading `v` blocked by lookbehind
- Email-adjacent strings (`@1.2.3.4`) - `@` blocked by lookbehind
- Date strings (`2026-05-20`) - dashes don't match the dotted-octet pattern
- Longer dotted strings (`1.2.3.4.5`) - trailing `.` blocked by lookahead

IPv6 regex requires at least 5 segments to avoid false-positives on time strings (`12:34`, `12:34:56`).

### R8 - stable-pseudonym

**Replaces:** Nothing in payload text - R8 is a **separate utility export** (`stablePseudonym(userId, repoOrigin)`) the caller invokes when constructing payload metadata.

**Why:** Maintainers want to group reports from the same user-and-repo without ever seeing identity. A deterministic 8-char hex pseudonym = `sha256(userId + ':' + normalized_repo_origin)[:8]` gives them that grouping key. Same user + same repo always hashes to the same 8 chars; different inputs produce different outputs. The URL normalization (strip protocol prefix, strip `.git`, lowercase) makes the hash stable across `git@github.com:foo/bar.git` and `https://github.com/foo/bar` shapes of the same origin.

**Before/after example:**
```
userId: 'alice'
repoOrigin: 'git@github.com:foo/bar.git'

pseudonym: 'a1b2c3d4'
```

**Coverage notes:** Defensive sentinel - if either input is falsy, returns `'00000000'` so call sites never crash on missing inputs. Caller may check for the sentinel if it matters. The `:` separator between userId and repoOrigin prevents collisions between `userId='a' + repoOrigin='bcd'` and `userId='abc' + repoOrigin='d'`.

## Consumed by

- **`scripts/lib/pseudonymize.cjs`** - implements R1..R8. The module's `RULES` manifest constant has a 1:1 correspondence with the sections above (R1..R8 ids match `RULES[i].id`).
- **Plan 30-02 (payload assembly)** - composes Phase 22 redaction + Phase 30 pseudonymization.
- **Plan 30-04 (consent prompt)** - uses the `replacements` log returned by `pseudonymize()` to display "X replacements made (R1: 3, R2: 5, ...)" summary before the user submits.
- **Plan 30-07 (`/hone:update --show-privacy-diff`)** - diffs this document plus `pseudonymize.cjs` between installed and target versions of the plugin. Always-show on first run after upgrade that touched these files; opt-in afterward (CONTEXT D-09).

## See also

- `scripts/lib/redact.cjs` (Phase 22) - secrets-stripping prerequisite layer in the payload pipeline.
- `.planning/phases/30-issue-reporter/CONTEXT.md` - D-01 pseudonymization-not-anonymization framing; D-13 synthetic-fixtures-plus-tmpdir test contract.
- `reference/registry.json` - registry entry for this document (`name: 'pseudonymization-rules'`, `phase: 30`, `type: 'meta-rules'`).
