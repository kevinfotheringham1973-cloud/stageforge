// Phase 3 of the Project Managed System build (PRD.html §06) — the AI
// Council mailbox pipeline calls this once it has found a reply to a
// pending request and classified it. This route is the actual
// gatekeeper: it never trusts the caller's classification as final,
// it independently re-verifies everything a real decision requires
// before writing anything.
//
// Hard boundary this route exists to enforce (see PRD.html §06's own
// "relay and recorder, never a decision-maker" framing): every one of
// the checks below can refuse to record a decision; none of them can
// be skipped, defaulted, or inferred. A refusal is a normal, expected
// outcome (recorded: false + a reason), not an error — the caller
// should surface it to the PM, never treat "couldn't verify" as
// "assume approved".
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth, getEmailApprovalSystemUserId } from "@/lib/emailApprovalApi";
import { isGateReadyForSponsor } from "@/lib/permissions";

type ReplyBody = {
  requestToken?: string;
  senderEmail?: string;
  decision?: "APPROVED" | "REJECTED" | "AMBIGUOUS";
  replyExcerpt?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  // The route param is named "id" for URL-shape consistency with the
  // sibling /sent route, but it's actually the EmailApproval's
  // requestToken, not its database id: the AI Council mailbox scanner that
  // calls this route only ever has the token it read out of the
  // "[REF: <token>]" marker in the reply's subject line — it never sees
  // the database id, so looking up by id here would make this route
  // uncallable from the one caller it exists for. requestToken is
  // @unique/cuid-generated, so it's just as safe a lookup key.
  const { id: requestToken } = await params;
  const body: ReplyBody = await request.json().catch(() => ({}));
  const senderEmail = String(body.senderEmail ?? "").trim().toLowerCase();
  const replyExcerpt = String(body.replyExcerpt ?? "").trim();

  const ea = await db.emailApproval.findUnique({
    where: { requestToken },
    include: {
      contact: true,
      gate: {
        include: {
          deliverables: true,
          complianceRequirements: { include: { coSignOffs: true } },
          spendRecords: true,
        },
      },
    },
  });
  if (!ea || ea.requestToken !== body.requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }
  if (ea.status !== "SENT") {
    return NextResponse.json({ recorded: false, reason: `Request is ${ea.status}, not SENT — nothing to capture a reply against.` });
  }

  // Guard 1: sender must match the roster's own on-file address for
  // this contact — a bare From: header the caller read off the email
  // is NOT trusted as identity on its own; this is the actual
  // verification (see the Phase 3 open question in PRD.html §06 about
  // hardening this further with SPF/DKIM or a reply token later).
  if (!senderEmail || senderEmail !== ea.contact.email.toLowerCase()) {
    await db.auditLogEntry.create({
      data: {
        actorId: await getEmailApprovalSystemUserId(),
        gateId: ea.gateId,
        action: "email_approval.reply_sender_mismatch",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason: `Reply claimed to be from ${senderEmail || "(no address)"}, expected ${ea.contact.email} — decision NOT recorded.`,
      },
    });
    return NextResponse.json({ recorded: false, reason: "sender_mismatch" });
  }

  // Guard 2: must be an explicit, unambiguous decision — never inferred.
  if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
    await db.auditLogEntry.create({
      data: {
        actorId: await getEmailApprovalSystemUserId(),
        gateId: ea.gateId,
        action: "email_approval.reply_ambiguous",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason: `Reply from ${ea.contact.email} was not an explicit, unambiguous approval or rejection — decision NOT recorded. Excerpt: ${replyExcerpt.slice(0, 300)}`,
      },
    });
    return NextResponse.json({ recorded: false, reason: "ambiguous" });
  }

  // Guard 3: the contact's role must still match what THIS attempt was
  // actually created for (ea.roleKey, set at request time from the
  // ApprovalRoutingTier that produced it — generalised 12 Sep 2026, was
  // hardcoded to "SPONSOR" before) — re-checked independently of
  // requestEmailApproval's own check, in case the role changed between
  // request and reply.
  if (ea.contact.roleKey !== ea.roleKey) {
    await db.auditLogEntry.create({
      data: {
        actorId: await getEmailApprovalSystemUserId(),
        gateId: ea.gateId,
        action: "email_approval.reply_role_no_longer_qualifies",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason: `${ea.contact.name}'s role is no longer ${ea.roleKey} (now ${ea.contact.roleKey ?? "unset"}) — decision NOT recorded.`,
      },
    });
    return NextResponse.json({ recorded: false, reason: "contact_role_no_longer_qualifies" });
  }

  // Guard 3.5: a GATE decision can only ever be made by SPONSOR — canDecideGate
  // (the in-app equivalent) is correctly role-locked to SPONSOR alone, no SRO
  // apex, no exceptions. Checked independently here, defensively, regardless
  // of how this attempt's roleKey came to be: requestEmailApproval already
  // refuses to create a non-SPONSOR Gate request, but /advance-tier's
  // role-escalation branch (escalateToRoleKey — real machinery for a
  // genuinely more senior role, e.g. SRO -> REGIONAL_DIRECTOR) is generic
  // and has no way to know THIS case is Gate-shaped and Sponsor-only. This
  // is the one place that actually writes a GateSignOff, so it's the right
  // place to enforce it regardless of which upstream path produced the row.
  if (ea.roleKey !== "SPONSOR") {
    await db.auditLogEntry.create({
      data: {
        actorId: await getEmailApprovalSystemUserId(),
        gateId: ea.gateId,
        action: "email_approval.role_cannot_decide_gate",
        entityType: "EmailApproval",
        entityId: ea.id,
        reason: `This attempt targets role ${ea.roleKey}, which cannot decide a Gate (only SPONSOR can) — decision NOT recorded.`,
      },
    });
    return NextResponse.json({ recorded: false, reason: "role_cannot_decide_gate" });
  }

  // Guard 4: same real preconditions decide() (the in-app Sponsor
  // approve/reject action) enforces — an email-captured decision gets
  // no less rigor than a real logged-in Sponsor's own click.
  const gate = ea.gate;
  if (gate.status !== "AWAITING_SPONSOR") {
    return NextResponse.json({ recorded: false, reason: "gate_not_awaiting_sponsor" });
  }
  if (body.decision === "APPROVED" && !isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements, gate.spendRecords)) {
    return NextResponse.json({ recorded: false, reason: "gate_not_ready" });
  }
  if (body.decision === "REJECTED" && !replyExcerpt) {
    return NextResponse.json({ recorded: false, reason: "rejection_needs_reason" });
  }

  // All guards passed — record it. Same transaction shape as decide()
  // (approveGate/rejectGate), plus the EmailApproval decision fields
  // and the capturedVia/emailApprovalId link on the new GateSignOff.
  // Generalised 12 Sep 2026: also SUPERSEDE every other attempt sharing
  // this case (same caseId) — any one peer's verified reply resolves the
  // whole multi-contact/multi-tier case, so siblings still PENDING/SENT at
  // any tier stop being actionable (excluded from /overdue, can never
  // separately decide the same gate again).
  const systemUserId = await getEmailApprovalSystemUserId();
  const now = new Date();
  await db.$transaction([
    db.emailApproval.update({
      where: { id: ea.id },
      data: { decision: body.decision, decisionEmail: replyExcerpt, verifiedSender: senderEmail, decidedAt: now, status: "DECIDED" },
    }),
    db.emailApproval.updateMany({
      where: { caseId: ea.caseId, id: { not: ea.id }, status: { in: ["PENDING", "SENT"] } },
      data: { status: "SUPERSEDED" },
    }),
    db.gateSignOff.create({
      data: {
        gateId: ea.gateId,
        decision: body.decision,
        signedOffById: systemUserId,
        reason: replyExcerpt || null,
        capturedVia: "EMAIL_PROXY",
        emailApprovalId: ea.id,
      },
    }),
    db.gate.update({
      where: { id: ea.gateId },
      data: {
        status: body.decision === "APPROVED" ? "SIGNED_OFF" : "IN_PROGRESS",
        ...(body.decision === "APPROVED" ? { actualEndDate: now } : {}),
      },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: ea.gateId,
        action: body.decision === "APPROVED" ? "gate.signed_off_via_email" : "gate.rejected_via_email",
        entityType: "Gate",
        entityId: ea.gateId,
        reason: `${ea.contact.name} <${ea.contact.email}>: ${replyExcerpt || "(no excerpt)"}`,
      },
    }),
  ]);

  return NextResponse.json({ recorded: true, decision: body.decision });
}
