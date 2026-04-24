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

This paragraph appears after a blank line and must be dropped by the truncator.
It contains otherwise-meaningful prose that simply isn't needed in the compact
bundle we pass to a headless agent. Drop it.

And this one too. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
consequat.

More filler prose. Duis aute irure dolor in reprehenderit in voluptate velit
esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat
non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Still more filler that padding brings us north of 8 KiB overall, ensuring the
truncator actually runs instead of short-circuiting. Lorem ipsum dolor sit
amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore
et dolore magna aliqua.

Yet more filler. Ut enim ad minim veniam, quis nostrud exercitation ullamco
laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

Section-overview padding line one — even more prose to push the file above
the 8 KiB threshold. This sentence continues with deliberately verbose text
that exists solely to consume bytes without contributing any useful signal
to a downstream reader.
Section-overview padding line two with the same shape and purpose — padding.
Section-overview padding line three with the same shape and purpose — padding.
Section-overview padding line four with the same shape and purpose — padding.
Section-overview padding line five with the same shape and purpose — padding.
Section-overview padding line six with the same shape and purpose — padding.
Section-overview padding line seven with the same shape and purpose — padding.
Section-overview padding line eight with the same shape and purpose — padding.
Section-overview padding line nine with the same shape and purpose — padding.
Section-overview padding line ten with the same shape and purpose — padding.

## Tasks

The Tasks section's first paragraph establishes the per-task workflow we use
throughout the plan. It is deliberately multi-line to exercise the keep-para
collector. A third line extends the paragraph to prove the collector handles
more than two lines.

Task 1 — Do the thing. Establish the foundational module and commit. This
paragraph sits after a blank line and is therefore dropped by the truncator.
Task 2 — Do the next thing. Build on task 1 and ship.
Task 3 — Wrap up. Polish + verify. Commit.

More filler that we expect to be dropped. Ipsum dolor sit amet, consectetur
adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna
aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident,
sunt in culpa qui officia deserunt mollit anim id est laborum.

More tasks filler padding line one — another long sentence to pad the file
with deliberately verbose prose that exists solely to consume bytes without
contributing signal.
More tasks filler padding line two with the same shape and purpose — padding.
More tasks filler padding line three with the same shape and purpose — padding.
More tasks filler padding line four with the same shape and purpose — padding.
More tasks filler padding line five with the same shape and purpose — padding.
More tasks filler padding line six with the same shape and purpose — padding.
More tasks filler padding line seven with the same shape and purpose — padding.
More tasks filler padding line eight with the same shape and purpose — padding.
More tasks filler padding line nine with the same shape and purpose — padding.
More tasks filler padding line ten with the same shape and purpose — padding.
More tasks filler padding line eleven with the same shape and purpose — padding.
More tasks filler padding line twelve with the same shape and purpose — padding.

## Testing

The Testing section describes how we validate the work across node:test units,
fixtures under tests/fixtures/context-engine, and the round-trip assertions
that lock down byte-level behavior.

A secondary paragraph inside the Testing section that is immediately dropped.
It exists to prove the drop-gap logic flushes correctly between sections.

Testing filler padding line one — yet another long sentence used purely to
grow the byte size of this fixture file above the truncator threshold without
contributing any real content to the downstream prompt.
Testing filler padding line two with the same shape and purpose — padding.
Testing filler padding line three with the same shape and purpose — padding.
Testing filler padding line four with the same shape and purpose — padding.
Testing filler padding line five with the same shape and purpose — padding.
Testing filler padding line six with the same shape and purpose — padding.
Testing filler padding line seven with the same shape and purpose — padding.
Testing filler padding line eight with the same shape and purpose — padding.
Testing filler padding line nine with the same shape and purpose — padding.
Testing filler padding line ten with the same shape and purpose — padding.

## Success Criteria

- [ ] First bullet of the success criteria list (kept as first paragraph).
- [ ] Second bullet (kept — contiguous non-blank run, no blank between us).
- [ ] Third bullet (still kept).
- [ ] Fourth bullet (still kept).

The paragraph beneath the success-criteria bullets is dropped because a blank
line terminates the first-paragraph run after the last bullet.

Success criteria filler padding line one — a long sentence intended solely to
grow the file past 8 KiB so the truncator actually executes its code path.
Success criteria filler padding line two with the same shape and purpose.
Success criteria filler padding line three with the same shape and purpose.
Success criteria filler padding line four with the same shape and purpose.
Success criteria filler padding line five with the same shape and purpose.
Success criteria filler padding line six with the same shape and purpose.
Success criteria filler padding line seven with the same shape and purpose.
Success criteria filler padding line eight with the same shape and purpose.
Success criteria filler padding line nine with the same shape and purpose.
Success criteria filler padding line ten with the same shape and purpose.
Success criteria filler padding line eleven with the same shape and purpose.
Success criteria filler padding line twelve with the same shape and purpose.
Success criteria filler padding line thirteen with the same shape and purpose.
Success criteria filler padding line fourteen with the same shape and purpose.
Success criteria filler padding line fifteen with the same shape and purpose.
Success criteria filler padding line sixteen with the same shape and purpose.
Success criteria filler padding line seventeen with the same shape and purpose.
Success criteria filler padding line eighteen with the same shape and purpose.
Success criteria filler padding line nineteen with the same shape and purpose.
Success criteria filler padding line twenty with the same shape and purpose.
Success criteria filler padding line twenty-one with the same shape and purpose.
Success criteria filler padding line twenty-two with the same shape and purpose.
Success criteria filler padding line twenty-three with the same shape and purpose.
Success criteria filler padding line twenty-four with the same shape and purpose.
