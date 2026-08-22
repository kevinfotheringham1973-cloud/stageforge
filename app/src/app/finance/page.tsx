import Link from "next/link";
import { db } from "@/lib/db";
import { isProjectStillLive } from "@/lib/permissions";

const GBP = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const APPROVAL_BUCKET_LABELS: Record<string, string> = {
  LIFECYCLE_REPLACEMENT: "Lifecycle replacement",
  SMALL_WORKS: "Small works",
  VARIATION: "Variation",
};

/**
 * Finance's portfolio-wide view (FinancialModel.html §06) — read-only,
 * the Finance role's equivalent of the Resource Manager's /resources:
 * every live project's spend total/approved/pending and per-bucket
 * split in one place, plus every record actually awaiting approval
 * with a direct link to where it's approved (the gate detail page —
 * this page never records or approves spend itself, same "view here,
 * act there" split /resources uses).
 */
export default async function FinancePage() {
  const projects = await db.project.findMany({
    where: { status: "ACTIVE" },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          gate: { include: { spendRecords: { include: { recordedBy: true } } } },
        },
      },
    },
  });

  const liveProjects = projects.filter((p) =>
    isProjectStillLive(p.stages.map((s) => s.gate).filter((g): g is NonNullable<typeof g> => g !== null))
  );

  const projectRows = liveProjects
    .map((p) => {
      const gates = p.stages.map((s) => s.gate).filter((g): g is NonNullable<typeof g> => g !== null);
      const spendRecords = gates.flatMap((g) => g.spendRecords.map((s) => ({ ...s, gateId: g.id, gateName: g.name })));

      const total = spendRecords.reduce((sum, s) => sum + Number(s.amount), 0);
      const approved = spendRecords.filter((s) => s.status === "APPROVED").reduce((sum, s) => sum + Number(s.amount), 0);
      const pendingRecords = spendRecords.filter((s) => s.status === "PENDING");
      const pending = pendingRecords.reduce((sum, s) => sum + Number(s.amount), 0);
      const byBucket = spendRecords.reduce<Record<string, number>>((acc, s) => {
        acc[s.bucket] = (acc[s.bucket] ?? 0) + Number(s.amount);
        return acc;
      }, {});

      return {
        projectNumber: p.projectNumber,
        projectName: p.name,
        total,
        approved,
        pending,
        pendingCount: pendingRecords.length,
        byBucket,
        pendingRecords,
      };
    })
    .filter((r) => r.total > 0)
    // Whatever needs approving floats to the top — that's the actual
    // job this page exists to make easy, not just a portfolio total.
    .sort((a, b) => b.pending - a.pending || b.total - a.total);

  const portfolioTotal = projectRows.reduce((sum, r) => sum + r.total, 0);
  const portfolioApproved = projectRows.reduce((sum, r) => sum + r.approved, 0);
  const portfolioPending = projectRows.reduce((sum, r) => sum + r.pending, 0);
  const portfolioPendingCount = projectRows.reduce((sum, r) => sum + r.pendingCount, 0);
  const portfolioByBucket = projectRows.reduce<Record<string, number>>((acc, r) => {
    for (const [bucket, amount] of Object.entries(r.byBucket)) {
      acc[bucket] = (acc[bucket] ?? 0) + amount;
    }
    return acc;
  }, {});

  const allPendingRecords = projectRows
    .flatMap((r) =>
      r.pendingRecords.map((s) => ({ ...s, projectNumber: r.projectNumber, projectName: r.projectName }))
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Finance</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Every live project&rsquo;s recorded spend, approved vs. pending, current state only. Approving or
        rejecting a record happens on the project&rsquo;s gate — this view is for finding what needs it and
        seeing the totals in one place.
      </p>

      <div className="mb-8 rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-wide text-ink">Portfolio total</h2>
        <div className="text-3xl font-extrabold">{GBP(portfolioTotal)}</div>
        <div className="text-sm font-medium text-inkmuted">total recorded</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="font-semibold text-ok">{GBP(portfolioApproved)}</span> approved
          </div>
          {portfolioPendingCount > 0 && (
            <div>
              <span className="font-semibold text-warn">{GBP(portfolioPending)}</span> pending ({portfolioPendingCount})
            </div>
          )}
        </div>
        {Object.keys(portfolioByBucket).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(portfolioByBucket).map(([bucket, amount]) => (
              <span
                key={bucket}
                className="rounded bg-accentsoft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent"
              >
                {APPROVAL_BUCKET_LABELS[bucket] ?? bucket} &middot; {GBP(amount)}
              </span>
            ))}
          </div>
        )}
      </div>

      {allPendingRecords.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
            Needs approval &middot; {allPendingRecords.length}
          </h2>
          <div className="flex flex-col gap-2">
            {allPendingRecords.map((s) => (
              <Link
                key={s.id}
                href={`/projects/${s.projectNumber}/gates/${s.gateId}#spend`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn bg-surface p-4 hover:border-accent"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{GBP(Number(s.amount))}</span>
                    <span className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                      {APPROVAL_BUCKET_LABELS[s.bucket] ?? s.bucket}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-inkmuted">{s.description}</p>
                  <div className="mt-0.5 font-mono text-xs text-inkmuted">
                    {s.projectName} (#{s.projectNumber}) &middot; {s.gateName} &middot; recorded by {s.recordedBy.name} &middot;{" "}
                    {s.createdAt.toLocaleDateString("en-GB")}
                  </div>
                </div>
                <span className="rounded bg-warn px-2 py-0.5 text-xs font-bold text-white">Pending</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {projectRows.length === 0 ? (
        <p className="text-sm text-inkmuted">No spend recorded against any live project yet.</p>
      ) : (
        <>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">By project</h2>
          <div className="flex flex-col gap-3">
            {projectRows.map((r) => (
              <Link
                key={r.projectNumber}
                href={`/projects/${r.projectNumber}`}
                className={`block rounded-lg border bg-surface p-5 hover:border-accent ${
                  r.pendingCount > 0 ? "border-warn" : "border-rule"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-accent">
                    {r.projectName} <span className="font-mono text-xs text-inkmuted">#{r.projectNumber}</span>
                  </span>
                  {r.pendingCount > 0 && (
                    <span className="rounded-full bg-warn px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-white">
                      Needs approval
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-xl font-bold">{GBP(r.total)}</span>
                  <span className="text-sm text-inkmuted">total recorded</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <div>
                    <span className="font-semibold text-ok">{GBP(r.approved)}</span> approved
                  </div>
                  {r.pendingCount > 0 && (
                    <div>
                      <span className="font-semibold text-warn">{GBP(r.pending)}</span> pending ({r.pendingCount})
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(r.byBucket).map(([bucket, amount]) => (
                    <span
                      key={bucket}
                      className="rounded bg-accentsoft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent"
                    >
                      {APPROVAL_BUCKET_LABELS[bucket] ?? bucket} &middot; {GBP(amount)}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
