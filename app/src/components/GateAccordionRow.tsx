"use client";

import { useState } from "react";

export function GateAccordionRow({
  summary,
  children,
  highlight = false,
  defaultExpanded = false,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  highlight?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`rounded-lg border bg-surface ${highlight ? "border-2 border-accent" : "border-rule"}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-6 py-5 text-left"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={`flex-none text-inkmuted transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex flex-1 items-center gap-5">{summary}</div>
      </button>
      {expanded && <div className="border-t border-rule px-6 py-6">{children}</div>}
    </div>
  );
}
