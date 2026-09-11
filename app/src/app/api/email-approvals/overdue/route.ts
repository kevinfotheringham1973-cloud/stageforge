// Phase 4 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline polls this to discover EmailApproval requests
// that have gone quiet and are due either a reminder to the same contact or
// an escalation to whoever requested the approval. Read-only, same split as
// GET .../pending: this only reports what's due, the caller sends the
// actual email and confirms back via POST .../reminded or .../escalated.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";
import { computeOverdueAction } from "@/lib/emailApprovalEscalation";

export async function GET(request: Request) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const candidates = await db.emailApproval.findMany({
    where: { status: "SENT", escalatedAt: null },
    orderBy: { sentAt: "asc" },
    include: {
      contact: { select: { name: true, email: true, roleKey: true, accountability: true } },
      gate: { select: { name: true, key: true, stage: { select: { project: { select: { name: true, projectNumber: true } } } } } },
      requestedBy: { select: { name: true, email: true } },
    },
  });

  const now = new Date();
  const overdue = candidates
    .map((ea) => ({ ea, action: computeOverdueAction(ea, now) }))
    .filter((x): x is { ea: (typeof candidates)[number]; action: "REMIND" | "ESCALATE" } => x.action !== null)
    .map(({ ea, action }) => ({
      id: ea.id,
      requestToken: ea.requestToken,
      sentAt: ea.sentAt!.toISOString(),
      reminderCount: ea.reminderCount,
      lastReminderAt: ea.lastReminderAt?.toISOString() ?? null,
      contact: ea.contact,
      gateName: ea.gate.name,
      gateKey: ea.gate.key,
      projectName: ea.gate.stage.project.name,
      projectNumber: ea.gate.stage.project.projectNumber,
      requestedByName: ea.requestedBy.name,
      requestedByEmail: ea.requestedBy.email,
      action,
    }));

  return NextResponse.json({ overdue });
}
