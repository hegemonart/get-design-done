import React from 'react';

// Intentionally contains a `transition: all` to exercise the findings engine.
export function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-4 transition" style={{ transition: 'all 200ms' }}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}
