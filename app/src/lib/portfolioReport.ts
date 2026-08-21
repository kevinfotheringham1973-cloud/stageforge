import { db } from "./db";
import {
  gateTimelineStatus,
  GATE_TIMELINE_LABELS,
  isProjectStillLive,
  type GateTimelineStatus,
} from "./permissions";

const GBP = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type PortfolioRow = {
  project: { id: string; projectNumber: string; name: string };
  worksPackage: { id: string; name: string } | null;
  currentGateName: string;
  totalSpend: number;
  approvedSpend: number;
  outstandingDeliverables: number;
  outstandingCompliance: number;
  estimatedCompletion: Date | null;
  timeline: GateTimelineStatus;
};

/**
 * Shared by the portfolio landing page and the scheduled-report email
 * so the two never drift — same per-project KPI math, just consumed as
 * React rows in one place and an HTML table in the other.
 */
export async function getPortfolioRows(): Promise<PortfolioRow[]> {
  const liveProjects = await db.project.findMany({
    where: { status: "ACTIVE" },
    include: {
      worksPackage: { select: { id: true, name: true } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          gate: { include: { deliverables: true, complianceRequirements: true, spendRecords: true } },
        },
      },
    },
  });

  return liveProjects
    .map((p) => {
      const gates = p.stages.map((s) => s.gate).filter((g): g is NonNullable<typeof g> => g !== null);
      if (!isProjectStillLive(gates)) return null;

      const currentGate = gates.find((g) => g.status !== "SIGNED_OFF") ?? gates[gates.length - 1] ?? null;

      const allSpend = gates.flatMap((g) => g.spendRecords);
      const totalSpend = allSpend.reduce((sum, s) => sum + Number(s.amount), 0);
      const approvedSpend = allSpend
        .filter((s) => s.status === "APPROVED")
        .reduce((sum, s) => sum + Number(s.amount), 0);

      const outstandingDeliverables = gates
        .flatMap((g) => g.deliverables)
        .filter((d) => d.blocksGate && d.status === "PENDING").length;
      const outstandingCompliance = gates
        .flatMap((g) => g.complianceRequirements)
        .filter((c) => c.blocksGate && c.status === "PENDING").length;

      const timeline = currentGate ? gateTimelineStatus(currentGate) : "NO_TARGET";

      const targetEndDates = gates.map((g) => g.targetEndDate).filter((d): d is Date => d !== null);
      const estimatedCompletion =
        targetEndDates.length > 0 ? new Date(Math.max(...targetEndDates.map((d) => d.getTime()))) : null;

      return {
        project: { id: p.id, projectNumber: p.projectNumber, name: p.name },
        worksPackage: p.worksPackage,
        currentGateName: currentGate ? currentGate.name : "Complete",
        totalSpend,
        approvedSpend,
        outstandingDeliverables,
        outstandingCompliance,
        estimatedCompletion,
        timeline,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

const TIMELINE_COLOR: Record<GateTimelineStatus, string> = {
  NO_TARGET: "#8a8a8a",
  NOT_STARTED_ON_TRACK: "#8a8a8a",
  NOT_STARTED_OVERDUE: "#b8860b",
  IN_PROGRESS_ON_TRACK: "#2563eb",
  IN_PROGRESS_OVERDUE: "#dc2626",
  COMPLETED_ON_TIME: "#16a34a",
  COMPLETED_LATE: "#b8860b",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline-styled (email-client-safe) HTML — no Tailwind, no external CSS. */
export function renderPortfolioReportHtml(rows: PortfolioRow[], baseUrl: string): string {
  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="6" style="padding:16px;color:#666;">No live projects.</td></tr>`
      : rows
          .map(
            (r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">
          <a href="${baseUrl}/projects/${r.project.projectNumber}" style="color:#2563eb;font-weight:600;text-decoration:none;">${escapeHtml(r.project.name)}</a>
          <div style="font-family:monospace;font-size:11px;color:#888;">#${r.project.projectNumber}</div>
          ${r.worksPackage ? `<div style="font-size:11px;color:#888;">Part of: ${escapeHtml(r.worksPackage.name)}</div>` : ""}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;">${escapeHtml(r.currentGateName)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:700;color:${TIMELINE_COLOR[r.timeline]};">${GATE_TIMELINE_LABELS[r.timeline]}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;white-space:nowrap;">${
          r.estimatedCompletion ? r.estimatedCompletion.toLocaleDateString("en-GB") : "Not set"
        }</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;white-space:nowrap;"><span style="color:#16a34a;">${GBP(r.approvedSpend)}</span> / ${GBP(r.totalSpend)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${
          r.outstandingDeliverables > 0 ? `<b style="color:#b8860b;">${r.outstandingDeliverables}</b>` : "0"
        } del. / ${r.outstandingCompliance > 0 ? `<b style="color:#dc2626;">${r.outstandingCompliance}</b>` : "0"} comp.</td>
      </tr>`
          )
          .join("");

  return `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;background:#f5f5f5;">
  <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:22px;">StageForge portfolio summary</h1>
    <p style="margin:0 0 20px;color:#666;font-size:13px;">${new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="text-align:left;border-bottom:2px solid #111;">
          <th style="padding:8px 12px;">Project</th>
          <th style="padding:8px 12px;">Current gate</th>
          <th style="padding:8px 12px;">Timeline</th>
          <th style="padding:8px 12px;">Est. completion</th>
          <th style="padding:8px 12px;">Cost approved / total</th>
          <th style="padding:8px 12px;">Outstanding</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin-top:20px;font-size:12px;color:#999;">Sent by StageForge &middot; <a href="${baseUrl}" style="color:#2563eb;">Open the portfolio view</a></p>
  </div>
</body></html>`;
}
