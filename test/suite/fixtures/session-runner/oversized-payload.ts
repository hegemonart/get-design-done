// tests/fixtures/session-runner/oversized-payload.ts
//
// Emit one chunk carrying a 100 KiB `tool_result` payload so the
// transcript writer's truncation path fires. Verifies the
// { truncated: true, preview: ... } substitution.

import { assistantChunk, type MockChunk } from './mock-query-stream.ts';

export function oversizedChunks(): MockChunk[] {
  // Build a 100 KiB blob.
  const blob = 'A'.repeat(100 * 1024);
  const oversized: Record<string, unknown> = {
    type: 'tool_result',
    tool_use_id: 'tool_1',
    content: [{ type: 'text', text: blob }],
  };
  const terminator = assistantChunk({
    stopReason: 'end_turn',
    inputTokens: 3,
    outputTokens: 2,
    model: 'claude-sonnet-4-5',
  });
  return [oversized, terminator];
}
