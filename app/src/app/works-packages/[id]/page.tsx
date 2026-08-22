import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { GATE_TIMELINE_LABELS, GATE_TIMELINE_TEXT_CLASS } from "@/lib/permissions";
import { getPortfolioRows } from "@/lib/portfolioReport";

const GBP = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "Assess the full project" (21 Aug 2026) — a Works Package is a
 * label on otherwise-independent projects (see schema.prisma), but a PM
 * or SRO still needs to look at the *combined* disruption window as one
 * thing: total spend across every system riding along with it, and
 * how many outstanding items stand between the whole package and being
 * clear, not just one project's slice of it. Reuses getPortfolioRows —
 * same per-project KPI math the portfolio page already shows, just
 * filtered to one package and summed.
 */
export default async function WorksPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const worksPackage = await db.worksPackage.findUnique({ where: { id } });
  if (!worksPackage) notFound();

  const [allRows, draftProjects] = await Promise.all([
    getPortfolioRows(),
    db.project.findMany({ where: { worksPackageId: id, status: "DRAFT" }, orderBy: { createdAt: "asc" } }),
  ]);
  const rows = allRows.filter((r) => r.worksPackage?.id === id);

  const totalSpend = rows.reduce((sum, r) => sum + r.totalSpend, 0);
  const approvedSpend = rows.reduce((sum, r) => sum + r.approvedSpend, 0);
  const outstandingDeliverables = rows.reduce((sum, r) => sum + r.outstandingDeliverables, 0);
  const outstandingCompliance = rows.reduce((sum, r) => sum + r.outstandingCompliance, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <Link href="/" className="mb-1 block text-xs font-semibold text-accent hover:underline">
        &larr; Portfolio
      </Link>
      <h1 className="mb-1 text-2xl font-bold">{worksPackage.name}</h1>
      <p className="mb-8 text-sm text-inkmuted">
        {rows.length} {rows.length === 1 ? "project" : "projects"} sharing this disruption window &mdash; each
        keeps its own complete, discipline-specific checklist; this is the combined view across all of them.
      </p>

      {draftProjects.length > 0 && (
        <div className="mb-8">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-flag">
            Drafts awaiting review &middot; {draftProjects.length}
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

      {rows.length === 0 && draftProjects.length === 0 ? (
        <p className="text-sm text-inkmuted">
          No live projects in this package right now &mdash; they may all be complete, or this package hasn&rsquo;t
          been assigned any live projects yet.
        </p>
      ) : rows.length === 0 ? null : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-rule bg-surface p-5">
              <div className="mb-1 font-mono text-xs font-bold uppercase tracking-wide text-ink">Combined spend</div>
              <div className="text-2xl font-extrabold">{GBP(totalSpend)}</div>
              <div className="text-sm font-medium text-inkmuted">
                <span className="font-semibold text-ok">{GBP(approvedSpend)}</span> approved
              </div>
            </div>
            <div className="rounded-lg border border-rule bg-surface p-5">
              <div className="mb-1 font-mono text-xs font-bold uppercase tracking-wide text-ink">
                Outstanding deliverables
              </div>
              <div className="text-2xl font-extrabold">{outstandingDeliverables}</div>
              <div className="text-sm font-medium text-inkmuted">across every project in the package</div>
            </div>
            <div className="rounded-lg border border-rule bg-surface p-5">
              <div className="mb-1 font-mono text-xs font-bold uppercase tracking-wide text-ink">
                Outstanding compliance
              </div>
              <div className="text-2xl font-extrabold">{outstandingCompliance}</div>
              <div className="text-sm font-medium text-inkmuted">across every project in the package</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-rule bg-surface2 text-left font-mono text-xs font-bold uppercase tracking-wide text-ink">
                  <th scope="col" className="px-4 py-3">
                    Project
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Current gate
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Timeline
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Cost approved / total
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Outstanding
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.id} className="border-b border-rule bg-surface last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${r.project.projectNumber}`} className="font-bold text-accent hover:underline">
                        {r.project.name}
                      </Link>
                      <div className="font-mono text-xs text-inkmuted">#{r.project.projectNumber}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{r.currentGateName}</td>
                    <td className={`px-4 py-3 font-bold ${GATE_TIMELINE_TEXT_CLASS[r.timeline]}`}>
                      {GATE_TIMELINE_LABELS[r.timeline]}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold">
                      <span className="text-ok">{GBP(r.approvedSpend)}</span> / {GBP(r.totalSpend)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.outstandingDeliverables === 0 && r.outstandingCompliance === 0 ? (
                        <span className="font-semibold text-inkmuted">Clear</span>
                      ) : (
                        <span className="text-sm">
                          {r.outstandingDeliverables > 0 && (
                            <span className="font-bold text-warn">{r.outstandingDeliverables} del.</span>
                          )}
                          {r.outstandingDeliverables > 0 && r.outstandingCompliance > 0 && (
                            <span className="text-inkmuted"> &middot; </span>
                          )}
                          {r.outstandingCompliance > 0 && (
                            <span className="font-bold text-flag">{r.outstandingCompliance} comp.</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Link
        href={`/projects/new?worksPackageId=${worksPackage.id}`}
        className="mt-6 inline-block rounded-md border border-rule px-4 py-2.5 text-sm font-semibold text-accent hover:bg-surface2"
      >
        + Add a system to this package
      </Link>
    </div>
  );
}
