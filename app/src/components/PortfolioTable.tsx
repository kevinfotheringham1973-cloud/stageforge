"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  GATE_TIMELINE_BORDER_CLASS,
  GATE_TIMELINE_LABELS,
  GATE_TIMELINE_TEXT_CLASS,
  type GateTimelineStatus,
} from "@/lib/permissions";

const GBP = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type PortfolioTableRow = {
  project: { id: string; projectNumber: string; name: string };
  worksPackage: { id: string; name: string } | null;
  siblings: { projectNumber: string; name: string }[];
  currentGateName: string;
  totalSpend: number;
  approvedSpend: number;
  outstandingDeliverables: number;
  outstandingCompliance: number;
  estimatedCompletion: Date | null;
  timeline: GateTimelineStatus;
  gatesSignedOff: number;
  gatesTotal: number;
};

function TimelineBadge({ timeline }: { timeline: GateTimelineStatus }) {
  return (
    <span
      className={`inline-block rounded-full border bg-surface px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${GATE_TIMELINE_TEXT_CLASS[timeline]} ${GATE_TIMELINE_BORDER_CLASS[timeline]}`}
    >
      {GATE_TIMELINE_LABELS[timeline]}
    </span>
  );
}

function GateDots({ signedOff, total }: { signedOff: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="mt-1.5 flex items-center gap-0.5" title={`${signedOff} of ${total} gates signed off`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < signedOff ? "bg-ok" : i === signedOff ? "bg-accent" : "bg-rule"}`}
        />
      ))}
    </div>
  );
}

function WorksPackageInfo({ row }: { row: PortfolioTableRow }) {
  if (!row.worksPackage) return null;
  return (
    <div className="mt-0.5 text-xs text-inkmuted">
      Part of:{" "}
      <Link href={`/works-packages/${row.worksPackage.id}`} className="font-semibold text-accent hover:underline">
        {row.worksPackage.name}
      </Link>
      {row.siblings.length > 0 && (
        <>
          {" "}
          with{" "}
          {row.siblings.map((s, i, arr) => (
            <span key={s.projectNumber}>
              <Link href={`/projects/${s.projectNumber}`} className="text-accent hover:underline">
                {s.name}
              </Link>
              {i < arr.length - 1 ? ", " : ""}
            </span>
          ))}
        </>
      )}
      {" · "}
      <Link href={`/projects/new?worksPackageId=${row.worksPackage.id}`} className="text-accent hover:underline">
        + Add a system
      </Link>
    </div>
  );
}

function OutstandingInfo({ row }: { row: PortfolioTableRow }) {
  if (row.outstandingDeliverables === 0 && row.outstandingCompliance === 0) {
    return <span className="font-semibold text-inkmuted">Clear &mdash; nothing outstanding</span>;
  }
  return (
    <span className="text-sm">
      {row.outstandingDeliverables > 0 && (
        <span className="font-bold text-warn">
          {row.outstandingDeliverables}{" "}
          <span className="font-semibold">deliverable{row.outstandingDeliverables === 1 ? "" : "s"}</span>
        </span>
      )}
      {row.outstandingDeliverables > 0 && row.outstandingCompliance > 0 && <span className="text-inkmuted"> &middot; </span>}
      {row.outstandingCompliance > 0 && (
        <span className="font-bold text-flag">
          {row.outstandingCompliance}{" "}
          <span className="font-semibold">compliance item{row.outstandingCompliance === 1 ? "" : "s"}</span>
        </span>
      )}
      <span className="block text-xs font-normal text-inkmuted">still to upload or sign off</span>
    </span>
  );
}

const STATUS_OPTIONS: { value: GateTimelineStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "IN_PROGRESS_OVERDUE", label: GATE_TIMELINE_LABELS.IN_PROGRESS_OVERDUE },
  { value: "NOT_STARTED_OVERDUE", label: GATE_TIMELINE_LABELS.NOT_STARTED_OVERDUE },
  { value: "COMPLETED_LATE", label: GATE_TIMELINE_LABELS.COMPLETED_LATE },
  { value: "IN_PROGRESS_ON_TRACK", label: GATE_TIMELINE_LABELS.IN_PROGRESS_ON_TRACK },
  { value: "NOT_STARTED_ON_TRACK", label: GATE_TIMELINE_LABELS.NOT_STARTED_ON_TRACK },
  { value: "COMPLETED_ON_TIME", label: GATE_TIMELINE_LABELS.COMPLETED_ON_TIME },
  { value: "NO_TARGET", label: GATE_TIMELINE_LABELS.NO_TARGET },
];

/**
 * Search + status filter live client-side over the already-fetched
 * rows (1 Sep 2026, group layout feedback) -- there's no server round
 * trip because the whole portfolio's already on the page; a "Region"
 * filter from the reference mockup was left out since projects don't
 * carry a region/site field in the data model yet, and faking one with
 * no real effect would be worse than not having it.
 */
export function PortfolioTable({ rows }: { rows: PortfolioTableRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GateTimelineStatus | "ALL">("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery =
        q.length === 0 || r.project.name.toLowerCase().includes(q) || r.project.projectNumber.toLowerCase().includes(q);
      const matchesStatus = status === "ALL" || r.timeline === status;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, status]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects by name or number"
          className="w-full max-w-xs rounded border border-inkmuted bg-surface px-3 py-1.5 text-sm sm:w-64"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as GateTimelineStatus | "ALL")}
          aria-label="Filter by timeline status"
          className="rounded border border-inkmuted bg-surface px-3 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {(query.length > 0 || status !== "ALL") && (
          <span className="text-xs text-inkmuted">
            {filtered.length} of {rows.length} project{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="mb-10 text-sm text-inkmuted">No projects match your search or filter.</p>
      ) : (
        <>
          {/* Boxed cards below sm: a table's row lines are too faint to track by touch/scroll on a phone.
              Full-bleed to the screen edge (negative margin cancels the page's own px-4) rather than
              floating boxes with margin either side. */}
          <div className="-mx-4 mb-10 flex flex-col gap-2 sm:hidden">
            {filtered.map((r) => (
              <div key={r.project.id} className="border-y border-rule bg-surface p-4 shadow-sm">
                <Link href={`/projects/${r.project.projectNumber}`} className="text-lg font-bold text-accent hover:underline">
                  {r.project.name}
                </Link>
                <div className="font-mono text-xs text-inkmuted">#{r.project.projectNumber}</div>
                <WorksPackageInfo row={r} />
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Current gate</div>
                    <div className="font-semibold">{r.currentGateName}</div>
                    <GateDots signedOff={r.gatesSignedOff} total={r.gatesTotal} />
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Timeline</div>
                    <div className="mt-0.5">
                      <TimelineBadge timeline={r.timeline} />
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Est. completion</div>
                    <div className="font-semibold">
                      {r.estimatedCompletion ? (
                        r.estimatedCompletion.toLocaleDateString("en-GB")
                      ) : (
                        <span className="font-normal text-inkmuted">Not set</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Cost approved / total</div>
                    <div className="whitespace-nowrap font-semibold">
                      <span className="text-ok">{GBP(r.approvedSpend)}</span>
                      {" / "}
                      {GBP(r.totalSpend)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Outstanding</div>
                    <OutstandingInfo row={r} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-10 hidden -mx-4 overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
            <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-base">
              <thead>
                <tr className="text-left font-mono text-xs font-bold uppercase tracking-wide text-ink">
                  <th scope="col" className="py-2 pr-4">Project</th>
                  <th scope="col" className="py-2 pr-4">Current gate</th>
                  <th scope="col" className="py-2 pr-4">Timeline</th>
                  <th scope="col" className="py-2 pr-4">Est. completion</th>
                  <th scope="col" className="py-2 pr-4">Cost approved / total</th>
                  <th scope="col" className="py-2 pr-4">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.project.id} className="align-top">
                    <td className="rounded-l-lg border-y border-l border-rule bg-surface py-4 pl-4 pr-4">
                      <Link href={`/projects/${r.project.projectNumber}`} className="text-lg font-bold text-accent hover:underline">
                        {r.project.name}
                      </Link>
                      <div className="font-mono text-xs text-inkmuted">#{r.project.projectNumber}</div>
                      <WorksPackageInfo row={r} />
                    </td>
                    <td className="border-y border-rule bg-surface py-4 pr-4 font-semibold">
                      {r.currentGateName}
                      <GateDots signedOff={r.gatesSignedOff} total={r.gatesTotal} />
                    </td>
                    <td className="border-y border-rule bg-surface py-4 pr-4">
                      <TimelineBadge timeline={r.timeline} />
                    </td>
                    <td className="border-y border-rule bg-surface py-4 pr-4 whitespace-nowrap font-semibold">
                      {r.estimatedCompletion ? (
                        r.estimatedCompletion.toLocaleDateString("en-GB")
                      ) : (
                        <span className="font-normal text-inkmuted">Not set</span>
                      )}
                    </td>
                    <td className="border-y border-rule bg-surface py-4 pr-4 whitespace-nowrap font-semibold">
                      <span className="text-ok">{GBP(r.approvedSpend)}</span>
                      {" / "}
                      {GBP(r.totalSpend)}
                    </td>
                    <td className="rounded-r-lg border-y border-r border-rule bg-surface py-4 pr-4 whitespace-nowrap">
                      <OutstandingInfo row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
