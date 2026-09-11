// Phase 4 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline calls this once it has genuinely sent a reminder
// email to the roster contact, discovered via GET .../overdue. Addressed by
// requestToken (see the Phase 3 /reply route's own comment on why — this is
// the only identifier the caller has, since it read this request's token
// off GET .../overdue rather than looking the database id up separately).
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

  const ea = await db.emailApproval.findUnique({ where: { requestToken } });
  if (!ea) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (ea.status !== "SENT") {
    return NextResponse.json({ error: `Already ${ea.status}, not SENT.` }, { status: 409 });
  }
  if (ea.escalatedAt) {
    return NextResponse.json({ error: "Already escalated — no further automated reminders." }, { status: 409 });
  }

  const now = new Date();
  const nextCount = ea.reminderCount + 1;
  const systemUserId = await getEmailApprovalSystemUserId();
  await db.$transaction([
    db.emailApproval.update({ where: { id: ea.id }, data: { reminderCount: nextCount, lastReminderAt: now } }),
    db.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: ea.gateId,
        action: "email_approval.reminder_sent",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason: `Reminder #${nextCount} sent to the roster contact for this pending email approval.`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, reminderCount: nextCount });
}
