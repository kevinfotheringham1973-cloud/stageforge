// Phase 4 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline calls this once it has genuinely sent an
// escalation email to whoever requested the approval, discovered via GET
// .../overdue with action "ESCALATE" (i.e. the contact has gone unanswered
// through MAX_REMINDERS_BEFORE_ESCALATION reminders).
//
// This route only ever records that a human was notified harder — it NEVER
// touches Gate.status or writes a GateSignOff. Escalating is not deciding;
// see emailApprovalEscalation.ts's own header comment for the governance
// boundary this enforces. Once escalatedAt is set, this EmailApproval drops
// out of GET .../overdue permanently — no further automated reminders or
// escalations, it's now entirely in the requesting PM's hands.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth, getEmailApprovalSystemUserId } from "@/lib/emailApprovalApi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const body = await request.json().catch(() => ({}));
  if (String(body.requestToken ?? "") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }

  const ea = await db.emailApproval.findUnique({ where: { requestToken }, include: { contact: true, requestedBy: true } });
  if (!ea) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (ea.status !== "SENT") {
    return NextResponse.json({ error: `Already ${ea.status}, not SENT.` }, { status: 409 });
  }
  // Already escalated — most likely a retry after a prior confirm call
  // failed post-send (same known email/confirm-not-atomic caveat as
  // send-email-approvals.mjs). Idempotent here since escalating twice
  // changes nothing about gate state; just don't double-count it.
  if (ea.escalatedAt) {
    return NextResponse.json({ ok: true, alreadyEscalated: true });
  }

  const now = new Date();
  const systemUserId = await getEmailApprovalSystemUserId();
  await db.$transaction([
    db.emailApproval.update({ where: { id: ea.id }, data: { escalatedAt: now } }),
    db.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: ea.gateId,
        action: "email_approval.escalated",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason: `${ea.contact.name} <${ea.contact.email}> has not responded after ${ea.reminderCount} reminder(s) — ${ea.requestedBy.name} was notified to follow up directly. No automated action was taken on the gate.`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
