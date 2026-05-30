---
plan: 99-01
name: example-long-plan
phase: 99
requirements: [EX-01, EX-02]
---

This preamble sits between the frontmatter and the first heading. It is intentionally short (well under 500 bytes) so the truncator preserves it verbatim.

# Overview

The overview section opens with a sentence that establishes scope. This line is
the first paragraph of the Overview section and must survive truncation. It
forms a single logical paragraph of multiple non-blank lines, all of which
belong to keep-para.

<!-- truncated: 36 lines removed -->

## Tasks

The Tasks section's first paragraph establishes the per-task workflow we use
throughout the plan. It is deliberately multi-line to exercise the keep-para
collector. A third line extends the paragraph to prove the collector handles
more than two lines.

<!-- truncated: 29 lines removed -->

## Testing

The Testing section describes how we validate the work across node:test units,
fixtures under tests/fixtures/context-engine, and the round-trip assertions
that lock down byte-level behavior.

<!-- truncated: 16 lines removed -->

## Success Criteria

- [ ] First bullet of the success criteria list (kept as first paragraph).
- [ ] Second bullet (kept — contiguous non-blank run, no blank between us).
- [ ] Third bullet (still kept).
- [ ] Fourth bullet (still kept).

<!-- truncated: 29 lines removed -->