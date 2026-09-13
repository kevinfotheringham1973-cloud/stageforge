// Phase 5 extended (PRD.html §06/§09, 12 Sep 2026) — the AI Council mailbox
// pipeline calls this when GET .../overdue reports action "ADVANCE_TIER"
// for a stuck EmailApproval: this case's current tier is exhausted (wait
// period + max reminders with no decision) and a next tier IS configured
// for this role (unlike the final ".../escalated" backstop, used only when
// no further tier exists). This route performs the real state transition —
// creates fresh PENDING EmailApproval rows for the next tier's real
// contacts (or, for a role-escalation tier, the escalate-to role's own
// Tier 1 contacts) and SUPERSEDES the current tier's rows — then returns
// the new rows so the caller can email them exactly like a fresh request
// (they'll also surface on the next GET .../pending poll regardless, same
// as any other PENDING row, so a caller that misses the response here loses
// nothing).
//
// Idempotent by design: a case can have several peer contacts at once tier,
// so more than one of that tier's rows can independently show up as
// ADVANCE_TIER-due on the same /overdue poll. Whichever one is processed
// first genuinely advances the case (creates the next tier's rows); every
// other sibling call for the same case finds those rows already exist and
// just supersedes itself without creating duplicates or double-emailing.
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

  const ea = await db.emailApproval.findUnique({
    where: { requestToken },
    include: { gate: { select: { name: true, key: true, stage: { select: { projectId: true, project: { select: { name: true, projectNumber: true } } } } } } },
  });
  if (!ea) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  const projectId = ea.gate.stage.projectId;

  // Idempotency check FIRST, before the strict status gate below — a real
  // case has several peer contacts at once tier, so more than one of that
  // tier's rows can independently show up as ADVANCE_TIER-due on the same
  // /overdue poll. Whichever sibling is processed first genuinely advances
  // the case and marks every row at this tier (including this one, if it's
  // a different row) SUPERSEDED — so by the time a LATER sibling call
  // reaches this route, ITS OWN row is already SUPERSEDED, not SENT. That
  // is the normal, expected shape of "someone else already handled this,"
  // not an error state — checked here, before the SENT-only gate, so it
  // resolves to a graceful alreadyAdvanced:true rather than a 409 (a real
  // bug caught by this project's own fire-testing discipline: an earlier
  // version of this route gated on status === "SENT" FIRST, which made a
  // superseded sibling's call to this exact route fail with a hard error
  // instead of the graceful no-op it should be).
  const alreadyAdvanced = await db.emailApproval.findFirst({ where: { caseId: ea.caseId, tier: ea.tier + 1 } });
  const systemUserId = await getEmailApprovalSystemUserId();
  if (alreadyAdvanced) {
    await db.emailApproval.updateMany({
      where: { id: ea.id, status: "SENT" },
      data: { status: "SUPERSEDED" },
    });
    return NextResponse.json({ ok: true, alreadyAdvanced: true, newAttempts: [] });
  }
  // Genuinely not yet advanced — a real advance can only proceed from a row
  // that's actually SENT (not PENDING, never sent yet; not DECIDED, already
  // resolved another way).
  if (ea.status !== "SENT") {
    return NextResponse.json({ error: `Already ${ea.status}, not SENT — cannot advance.` }, { status: 409 });
  }

  const nextTier = await db.approvalRoutingTier.findUnique({
    where: { projectId_roleKey_tier: { projectId, roleKey: ea.roleKey, tier: ea.tier + 1 } },
    include: { contacts: { include: { contact: true } } },
  });
  if (!nextTier) {
    return NextResponse.json({ error: "No next tier is configured for this role — use /escalated instead." }, { status: 409 });
  }

  // A role-escalation tier hands off to a genuinely different, more senior
  // role's OWN Tier 1 contacts (e.g. SRO -> REGIONAL_DIRECTOR) rather than
  // more peers at the same role — resolved fresh here, not fixed at the
  // original request, since the escalate-to role's own roster can change
  // over time independent of when this case started.
  let nextRoleKey = ea.roleKey;
  let nextContacts = nextTier.contacts.map((c) => c.contact).filter((c) => c.active);
  if (nextTier.escalateToRoleKey) {
    nextRoleKey = nextTier.escalateToRoleKey;
    const escalateTargetTier1 = await db.approvalRoutingTier.findUnique({
      where: { projectId_roleKey_tier: { projectId, roleKey: nextRoleKey, tier: 1 } },
      include: { contacts: { include: { contact: true } } },
    });
    nextContacts = (escalateTargetTier1?.contacts ?? []).map((c) => c.contact).filter((c) => c.active);
  }
  if (nextContacts.length === 0) {
    return NextResponse.json(
      { error: `No active contact(s) configured for the next tier (role: ${nextRoleKey}) — cannot advance.` },
      { status: 409 }
    );
  }

  const now = new Date();
  const newAttempts = await db.$transaction(async (tx) => {
    await tx.emailApproval.updateMany({
      where: { caseId: ea.caseId, tier: ea.tier, status: { in: ["PENDING", "SENT"] } },
      data: { status: "SUPERSEDED" },
    });
    const rows = await Promise.all(
      nextContacts.map((contact) =>
        tx.emailApproval.create({
          data: {
            gateId: ea.gateId,
            contactId: contact.id,
            requestedById: ea.requestedById,
            roleKey: nextRoleKey,
            caseId: ea.caseId,
            tier: ea.tier + 1,
          },
          include: { contact: true },
        })
      )
    );
    await tx.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: ea.gateId,
        action: "email_approval.advanced_tier",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason:
          `Tier ${ea.tier} (${ea.roleKey}) unanswered after ${ea.reminderCount} reminder(s) — advanced to Tier ${ea.tier + 1}` +
          (nextTier.escalateToRoleKey ? ` (escalated to ${nextRoleKey})` : "") +
          `: ${rows.map((r) => `${r.contact.name} <${r.contact.email}>`).join(", ")}.`,
      },
    });
    return rows;
  });

  return NextResponse.json({
    ok: true,
    alreadyAdvanced: false,
    newAttempts: newAttempts.map((r) => ({
      requestToken: r.requestToken,
      contact: { name: r.contact.name, email: r.contact.email, roleKey: r.contact.roleKey, accountability: r.contact.accountability },
    })),
    gateName: ea.gate.name,
    projectName: ea.gate.stage.project.name,
    projectNumber: ea.gate.stage.project.projectNumber,
    requestedAt: now.toISOString(),
  });
}
