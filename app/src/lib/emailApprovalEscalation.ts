// Phase 4 of the Project Managed System build (PRD.html §06/§09) —
// escalation/reminder policy for an EmailApproval stuck in SENT with no
// reply. Kept as a pure function so it's trivially unit-testable without a
// database, and so the policy lives in exactly one place rather than being
// re-derived by both GET /api/email-approvals/overdue and its own tests.
//
// Hard boundary this exists to enforce (same "relay and recorder, never a
// decision-maker" governance boundary as Phase 3's /reply route): escalating
// means notifying a human harder, never proceeding on the gate anyway. Once
// an EmailApproval is escalated, it permanently drops out of /overdue --
// the system stops nagging automatically and leaves it entirely to the PM
// who requested it. There is no code path anywhere that treats
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

// Returns null when nothing is due yet (or this EmailApproval isn't a
// candidate at all -- not SENT, never actually sent, or already escalated).
export function computeOverdueAction(ea: OverdueCheckInput, now: Date = new Date()): OverdueAction | null {
  if (ea.status !== "SENT" || !ea.sentAt || ea.escalatedAt) return null;
  const since = ea.lastReminderAt ?? ea.sentAt;
  const elapsedMs = now.getTime() - since.getTime();
  if (elapsedMs < REMINDER_INTERVAL_MS) return null;
  return ea.reminderCount >= MAX_REMINDERS_BEFORE_ESCALATION ? "ESCALATE" : "REMIND";
}
