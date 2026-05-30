import React from 'react';

// Exercises a non-transform scale-on-press drift.
export function Badge({ count, onClick }: { count: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-slate-100 px-2 py-1 transition-transform active:scale-97"
    >
      {count}
    </button>
  );
}
