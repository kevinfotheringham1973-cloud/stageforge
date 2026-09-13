// Phase 4 of the Project Managed System build (PRD.html §06/§09) —
// escalation/reminder policy for an EmailApproval stuck in SENT with no
// reply. Kept as a pure function so it's trivially unit-testable without a
// database, and so the policy lives in exactly one place rather than being
// re-derived by both GET /api/email-approvals/overdue and its own tests.
//
// Generalised 12 Sep 2026 (PRD.html §06/§09 Phase 5 extended): the wait
// interval and reminder count before advancing are now read from the
// ApprovalRoutingTier that produced this row (waitHours/
// maxRemindersBeforeAdvancing), configurable per role per project, rather
// than the fixed global constants Phase 4 originally shipped with. The
// constants below survive only as the DEFAULT a tier falls back to if it
// somehow lacks its own values (schema defaults make this unlikely in
// practice) and to keep this function's own unit tests meaningful without
// a database.
//
// This function still only ever answers "REMIND" or "ESCALATE" — it has no
// idea whether a next escalation tier exists (that's a DB lookup against
// ApprovalRoutingTier, deliberately kept OUT of this pure function). The
// caller (GET /api/email-approvals/overdue) is what decides whether
// "ESCALATE" concretely means "advance to the next tier" or "notify the
// requester, mechanism exhausted" — see that route's own comment.
//
// Hard boundary this exists to enforce (same "relay and recorder, never a
// decision-maker" governance boundary as Phase 3's /reply route): escalating
// means notifying a human harder or moving to the next real person, never
// proceeding on the gate anyway. There is no code path anywhere that treats
// non-response, a maxed-out reminder count, or an escalation as consent.

export const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const MAX_REMINDERS_BEFORE_ESCALATION = 2;

export type OverdueAction = "REMIND" | "ESCALATE";

export interface OverdueCheckInput {
  status: string;
  sentAt: Date | null;
  lastReminderAt: Date | null;
  reminderCount: number;
  escalatedAt: Date | null;
}

export interface OverdueCheckConfig {
  waitMs: number;
  maxReminders: number;
}

// Returns null when nothing is due yet (or this EmailApproval isn't a
// candidate at all -- not SENT, never actually sent, or already escalated).
export function computeOverdueAction(
  ea: OverdueCheckInput,
  now: Date = new Date(),
  config: OverdueCheckConfig = { waitMs: REMINDER_INTERVAL_MS, maxReminders: MAX_REMINDERS_BEFORE_ESCALATION }
): OverdueAction | null {
  if (ea.status !== "SENT" || !ea.sentAt || ea.escalatedAt) return null;
  const since = ea.lastReminderAt ?? ea.sentAt;
  const elapsedMs = now.getTime() - since.getTime();
  if (elapsedMs < config.waitMs) return null;
  return ea.reminderCount >= config.maxReminders ? "ESCALATE" : "REMIND";
}
