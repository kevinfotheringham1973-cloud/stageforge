import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUserGlobalRoleKeys } from "@/lib/session";
import {
  canManageScheduledReports,
  DAY_NAMES,
  GATE_TIMELINE_LABELS,
  GATE_TIMELINE_TEXT_CLASS,
} from "@/lib/permissions";
import { getPortfolioRows } from "@/lib/portfolioReport";
import { createScheduledReport, deleteScheduledReport, sendScheduledReportNow } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";

const GBP = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The landing page (confirmed by Kevin, 20 Aug 2026: default to the
 * portfolio view, since it carries the most overall detail and every
 * project is reachable from it anyway) — every live project in one
 * place, with cost approved-vs-total, which gate it's at, and what's
 * still outstanding. The same per-project KPI math the project
 * dashboard already does (see the (dashboard) layout), just run once
 * per project and laid out as rows instead of cards, since scanning
 * many projects at once is the whole point here.
 */
export default async function HomePage() {
  const [rows, draftProjects, globalRoleKeys, scheduledReports, allUsers] = await Promise.all([
    getPortfolioRows(),
    db.project.findMany({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" } }),
    getCurrentUserGlobalRoleKeys(),
    db.scheduledReport.findMany({ orderBy: { dayOfWeek: "asc" }, include: { createdBy: true } }),
    db.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const canManage = canManageScheduledReports(globalRoleKeys);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-3xl font-bold">Portfolio</h1>
      <p className="mb-8 text-base text-inkmuted">
        Every live project in one view — current gate, cost approved vs. recorded, and what&rsquo;s
        still outstanding. Select a project below to open its dashboard. A project drops off once
        every one of its gates is signed off.
      </p>

      {draftProjects.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
            Drafts awaiting review
          </div>
          <div className="flex flex-col gap-2">
            {draftProjects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.projectNumber}/provisioning`}
                className="flex items-center justify-between rounded-lg border border-dashed border-flag bg-accentsoft/30 px-4 py-3 hover:border-accent"
              >
                <div>
                  <span className="font-semibold">{p.name}</span>{" "}
                  <span className="font-mono text-xs text-inkmuted">#{p.projectNumber}</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-flag">Review draft</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mb-10 text-sm text-inkmuted">No live projects.</p>
      ) : (
        <div className="mb-10 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[980px] border-collapse text-base">
            <thead>
              <tr className="border-b-2 border-rule text-left font-mono text-xs font-bold uppercase tracking-wide text-ink">
                <th className="py-3 pr-4">Project</th>
                <th className="py-3 pr-4">Current gate</th>
                <th className="py-3 pr-4">Timeline</th>
                <th className="py-3 pr-4">Est. completion</th>
                <th className="py-3 pr-4">Cost approved / total</th>
                <th className="py-3 pr-4">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project.id} className="border-b border-rule">
                  <td className="py-4 pr-4">
                    <Link href={`/projects/${r.project.projectNumber}`} className="text-lg font-bold text-accent hover:underline">
                      {r.project.name}
                    </Link>
                    <div className="font-mono text-xs text-inkmuted">#{r.project.projectNumber}</div>
                  </td>
                  <td className="py-4 pr-4 font-semibold">{r.currentGateName}</td>
                  <td className={`py-4 pr-4 font-bold ${GATE_TIMELINE_TEXT_CLASS[r.timeline]}`}>
                    {GATE_TIMELINE_LABELS[r.timeline]}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap font-semibold">
                    {r.estimatedCompletion ? (
                      r.estimatedCompletion.toLocaleDateString("en-GB")
                    ) : (
                      <span className="font-normal text-inkmuted">Not set</span>
                    )}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap font-semibold">
                    <span className="text-ok">{GBP(r.approvedSpend)}</span>
                    {" / "}
                    {GBP(r.totalSpend)}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap">
                    {r.outstandingDeliverables === 0 && r.outstandingCompliance === 0 ? (
                      <span className="font-semibold text-inkmuted">Clear</span>
                    ) : (
                      <span className="text-sm">
                        {r.outstandingDeliverables > 0 && (
                          <span className="font-bold text-warn">
                            {r.outstandingDeliverables} <span className="font-semibold">del.</span>
                          </span>
                        )}
                        {r.outstandingDeliverables > 0 && r.outstandingCompliance > 0 && (
                          <span className="text-inkmuted"> &middot; </span>
                        )}
                        {r.outstandingCompliance > 0 && (
                          <span className="font-bold text-flag">
                            {r.outstandingCompliance} <span className="font-semibold">comp.</span>
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-rule bg-surface p-5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Scheduled reports</div>
        <p className="mb-4 text-sm text-inkmuted">
          Emails this portfolio view to its recipients automatically at 08:00 on the day selected below.
          Recipients are drawn from each user&rsquo;s account email — an address on a placeholder
          (<code>.example</code>) domain will simply fail to send.
        </p>

        {scheduledReports.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {scheduledReports.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rule bg-bg px-4 py-2.5 text-sm"
              >
                <div>
                  <span className="font-semibold">{r.label}</span>{" "}
                  <span className="text-inkmuted">
                    &middot; every {DAY_NAMES[r.dayOfWeek]} &middot; {r.recipientUserIds.length} recipient(s)
                    {r.lastSentAt && (
                      <>
                        {" "}
                        &middot; last sent{" "}
                        {r.lastSentAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </>
                    )}
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <form action={sendScheduledReportNow.bind(null, r.id)}>
                      <SubmitButton pendingText="Sending…" className="rounded border border-rule px-2.5 py-1 text-xs font-semibold text-accent">
                        Send now
                      </SubmitButton>
                    </form>
                    <form action={deleteScheduledReport.bind(null, r.id)}>
                      <SubmitButton pendingText="Removing…" className="rounded border border-rule px-2.5 py-1 text-xs font-semibold text-risk">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage ? (
          <form action={createScheduledReport} className="flex flex-col gap-3 rounded-lg border border-dashed border-rule p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Label</label>
                <input
                  name="label"
                  required
                  placeholder="e.g. Weekly SRO portfolio summary"
                  className="w-64 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Every</label>
                <select name="dayOfWeek" defaultValue={5} className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm">
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Recipients</label>
              <div className="flex flex-wrap gap-3">
                {allUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="recipientUserIds" value={u.id} />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
            <SubmitButton pendingText="Adding…" className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
              Add schedule
            </SubmitButton>
          </form>
        ) : (
          <p className="text-xs text-inkmuted">Only an SRO, Compliance Officer, or Client Authority can set up scheduled reports.</p>
        )}
      </div>
    </div>
  );
}
