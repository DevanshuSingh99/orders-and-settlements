"use client";

import { useId, useState } from "react";

/**
 * Compact info control — letter "i" that shows guidance on hover/focus.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex size-5 items-center justify-center rounded-full border border-zinc-300 text-[11px] font-semibold leading-none text-zinc-500 hover:border-zinc-500 hover:text-zinc-800"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open ? (
        <span
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-7 z-20 w-64 rounded-md border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-md"
        >
          <span className="mb-1 block font-medium text-zinc-800">{label}</span>
          {children}
        </span>
      ) : null}
    </span>
  );
}
