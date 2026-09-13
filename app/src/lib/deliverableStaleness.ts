// Generalises the EmailApproval overdue pattern (emailApprovalEscalation.ts
// + GET /api/email-approvals/overdue) to Deliverables -- same pure,
// deterministic, no-LLM-judgment-call shape, kept in its own file for the
// same reason: the policy should live in exactly one place, trivially
// unit-testable without a database. A deliverable has no SENT state or
// contact/tier routing, so this is a smaller, simpler question than
// computeOverdueAction answers: just "has this gone quiet" or "has this
// missed its target," not "who gets reminded next."
//
// Built 13 Sep 2026 per Kevin's own framing: AI Council oversight isn't
// only drafting documents, it's also sensing when a deliverable a human PM
// owns has gone stale and surfacing that -- the same relay-and-recorder
// role, applied to time instead of documents. Scoped to in-app surfacing
// only for this first version (Kevin's call) -- no outbound email here.

export type DeliverableStalenessAction = "STALE" | null;

export interface DeliverableStalenessInput {
  status: string; // DeliverableStatus -- plain string so this stays DB-shape-agnostic and testable without importing Prisma's generated enum
  targetEndDate: Date | null;
  lastActivityAt: Date;
  lastStalenessAckAt: Date | null;
}

export const DEFAULT_STALE_AFTER_DAYS = 14;
export const DEFAULT_STALE_AFTER_MS = DEFAULT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

// Two firing conditions, either sufficient:
//  (a) the gate set a real targetEndDate and it's passed with this
//      deliverable still not closed out, or
//  (b) no target was set at all (the common case today -- every gate on
//      #30005 shows "No target set") and nothing has happened on this
//      deliverable for staleAfterMs.
// A PM's own ack (lastStalenessAckAt) suppresses the flag only if it's more
// recent than the last real activity -- new activity after an ack starts a
// fresh staleness clock rather than being suppressed forever by an old ack.
export function computeDeliverableStalenessAction(
  d: DeliverableStalenessInput,
  now: Date = new Date(),
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS
): DeliverableStalenessAction {
  if (d.status === "EVIDENCED" || d.status === "BYPASSED") return null;

  const overdueByTarget = d.targetEndDate !== null && now.getTime() > d.targetEndDate.getTime();
  const idleTooLong = d.targetEndDate === null && now.getTime() - d.lastActivityAt.getTime() >= staleAfterMs;
  if (!overdueByTarget && !idleTooLong) return null;

  if (d.lastStalenessAckAt && d.lastStalenessAckAt.getTime() >= d.lastActivityAt.getTime()) return null;

  return "STALE";
}
