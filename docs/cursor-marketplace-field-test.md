# Cursor Marketplace — maintainer field-test

This runbook describes the post-merge field-test for publishing
`get-design-done` to the Cursor Marketplace. It is **maintainer-only** —
contributors don't need to read this; it documents the human-in-the-loop
steps that v1.28.8 cannot automate.

## Why this is multi-step

Cursor Marketplace is **publisher-application-gated** (per D-16 in
`.planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md`):
submission happens at `cursor.com/marketplace/publish`, there is no
install-by-URL CLI for the public channel, and approval is gated by
manual Cursor team review with **no published SLA**. The publish action
itself is then performed through the marketplace UI once approval lands.

v1.28.8 ships all of the code: the manifest at `.cursor-plugin/plugin.json`
(Plan B1), the channel-specific bundle generator (Plan X1), and the
`scripts/install.cjs --doctor` status surface (this plan, B2). What
v1.28.8 *cannot* ship — because it is gated by an external party — is the
**live marketplace presence**. That may lag the v1.28.8 release tag by
days or weeks, depending on Cursor's review queue.

## Steps (post-merge, maintainer-only)

1. **Confirm `.cursor-plugin/plugin.json` is current.** From the repo
   root, run:
   ```
   node scripts/install.cjs --doctor
   ```
   Expected output (lines abbreviated):
   ```
   === Cursor Marketplace status ===
     Manifest:         .cursor-plugin/plugin.json (v1.28.8)  ✓ matches package.json
     Schema validity:  valid
     Application:      not-submitted (-)
     Next step:        submit publisher application at cursor.com/marketplace/publish; see docs/cursor-marketplace-field-test.md
   ```
   If `Schema validity` is anything other than `valid`, or if the manifest
   version does not match `package.json`, **fix that first** before
   submitting. Re-run the doctor until both gates report green.

2. **Submit the publisher application.** Navigate in a browser to
   `https://cursor.com/marketplace/publish`. The submission form asks for:
   - Plugin manifest URL — link the canonical
     `https://github.com/hegemonart/get-design-done/blob/main/.cursor-plugin/plugin.json`
   - Repository URL — `https://github.com/hegemonart/get-design-done`
   - Publisher identity — your `hegemonart` GitHub handle
   - Contact email — for the approval / rejection notification

3. **Record the submission locally.** Create a new file at
   `.cursor-plugin/marketplace-state.json` with the following content
   (substitute the real ISO-8601 timestamp from when you clicked submit):
   ```json
   {
     "status": "submitted-pending",
     "submitted-at": "2026-05-22T14:00:00Z"
   }
   ```
   **This file is gitignored** — never commit it. It is the local source
   of truth for the doctor's status display. Verify the doctor picks it
   up:
   ```
   node scripts/install.cjs --doctor
   ```
   Expected:
   ```
     Application:      submitted-pending (submitted 2026-05-22)
     Next step:        await Cursor team review approval; no published SLA per D-16
   ```

4. **Await Cursor team review approval.** There is **no published SLA**.
   The doctor will continue to report `submitted-pending` until you
   manually update the state file in step 5 or step 7. There is no
   public "check application status" CLI on Cursor's side — the only
   signal is the approval (or rejection) email from `noreply@cursor.com`
   (subject typically begins "Your Cursor Marketplace application").

5. **On approval — publish through the marketplace UI.** Cursor's
   approval email links to the publish-action form in the marketplace
   UI per `cursor.com/docs/reference/plugins#publishing`. The UI
   presents a final "Publish" button. Once clicked, the plugin is live
   at a `cursor.com/marketplace/...` URL. Save that URL.

6. **Record the live state.** Edit `.cursor-plugin/marketplace-state.json`
   to:
   ```json
   {
     "status": "approved-published",
     "marketplace-url": "https://cursor.com/marketplace/hegemonart/get-design-done",
     "submitted-at": "2026-05-22T14:00:00Z",
     "approved-at": "2026-06-01T09:30:00Z"
   }
   ```
   Substitute the real URL Cursor assigns and the real approval
   timestamp. Re-run `node scripts/install.cjs --doctor`; the doctor
   should now report `Application: approved-published (live at <url>)`.

7. **If rejected.** Edit `.cursor-plugin/marketplace-state.json` to:
   ```json
   {
     "status": "rejected",
     "submitted-at": "2026-05-22T14:00:00Z",
     "reason": "<copy Cursor's stated rejection reason verbatim>"
   }
   ```
   The doctor will then surface the rejection reason on every
   `--doctor` invocation as a reminder. Address the reason in a
   follow-up patch (the change may need its own short phase if it
   touches schema), then re-submit per step 2 — at that point,
   overwrite `marketplace-state.json` back to `submitted-pending` with
   the new timestamp.

## No-SLA caveat

> **Note (D-16):** v1.28.8 ships the Cursor Marketplace manifest code
> and bundle generators, but Cursor team review is gated with **no
> published SLA**. Live marketplace presence may lag the v1.28.8 release
> by days or weeks. The doctor mode is the maintainer's status-check
> surface — there is no API to poll Cursor's review queue, and there is
> no way for contributors or end users to verify the marketplace listing
> via tooling. Communicate the review-window expectation in any release
> notes that mention Cursor Marketplace as a distribution channel.

## Doctor states reference

| State                 | Doctor output                                      | Maintainer action                                                       |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `not-submitted`       | `Application: not-submitted (-)`                   | Submit at `cursor.com/marketplace/publish` (step 2)                     |
| `submitted-pending`   | `Application: submitted-pending (submitted <date>)`| Await approval email; no action                                         |
| `approved-published`  | `Application: approved-published (live at <url>)`  | None — done                                                              |
| `rejected`            | `Application: rejected (<reason>)`                 | Address reason; re-submit (step 7)                                       |

## See also

- `.planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md` — D-16
  is the canonical source for the multi-step framing of this flow, plus
  D-04 (publisher-application gating), D-09 (live-publish post-merge),
  and D-10 (tmpdir-only test discipline).
- `https://cursor.com/docs/reference/plugins` — Cursor's authoritative
  plugin spec, including the manifest schema and publish workflow.
- `docs/codex-plugins-field-test.md` — parallel field-test doc for the
  Codex Plugin distribution channel (will exist once Plan 28-8-C2
  ships). Codex's flow is single-step (`codex plugin marketplace add
  hegemonart/get-design-done`) rather than multi-step, per D-03.
