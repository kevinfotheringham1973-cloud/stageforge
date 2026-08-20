// Core governance rules, as pure functions — the same logic drawn in
// DataModel.html's gate-closure diagram, made real. Deliberately has
// no DB dependency so it stays trivially testable.

import type {
  BypassAuthority,
  ComplianceRequirementStatus,
  DeliverableStatus,
  GateStatus,
  SpendRecordStatus,
} from "@prisma/client";

/**
 * The roles the Resource/Capacity view tracks (ResourceCapacityModel.html
 * §01 decided flag) — the people doing hands-on project work, whose time
 * is the scarce thing being planned. Sponsor/SRO/Compliance Officer sit
 * outside this view.
 */
export const DELIVERY_FACING_ROLE_KEYS = [
  "PM",
  "AUTHORISED_PERSON_WATER",
  "AUTHORISED_PERSON_ELECTRICAL",
  "AUTHORISED_PERSON_MEDICAL_GASES",
  "AUTHORISED_PERSON_VENTILATION",
  "AUTHORISING_ENGINEER_WATER",
  "AUTHORISING_ENGINEER_ELECTRICAL",
  "AUTHORISING_ENGINEER_MEDICAL_GASES",
  "AUTHORISING_ENGINEER_VENTILATION",
  "PRINCIPAL_DESIGNER",
  "FM_CONTRACTOR",
];

// Authority ladder: SRO can do anything Compliance Officer or PM can
// do (bypass-wise); Compliance Officer can do anything PM can do;
// PM is the floor. A role with no bypass standing at all (Sponsor,
// FM Contractor, Client Authority, ...) ranks -1 and never qualifies.
// FIRE_OFFICER is NOT part of this ladder — see canBypassDeliverable.
const BYPASS_AUTHORITY_RANK: Record<BypassAuthority, number> = {
  PM: 0,
  COMPLIANCE_OFFICER: 1,
  SRO: 2,
  FIRE_OFFICER: -1, // unreachable via rank comparison — always intercepted below
};

function roleKeyBypassRank(roleKey: string): number {
  switch (roleKey) {
    case "PM":
      return 0;
    case "COMPLIANCE_OFFICER":
      return 1;
    case "SRO":
      return 2;
    default:
      return -1;
  }
}

/**
 * Can a user holding these roles (on this project) bypass a
 * deliverable that requires `requiredAuthority`?
 *
 * Confirmed by Kevin: a PM cannot bypass a deliverable that carries
 * legal weight — that escalates to Compliance Officer or SRO. Every
 * bypass, at any authority level, requires a written reason (enforced
 * at the call site — see actions.ts — not here).
 *
 * FIRE_OFFICER is an exact-match requirement, not a rank on the ladder
 * above — confirmed by Kevin, 20 Aug 2026: an SRO has no professional
 * standing to assess fire safety, so unlike every other tier here, SRO
 * does NOT automatically qualify for a fire-authority item.
 */
export function canBypassDeliverable(
  actorRoleKeys: string[],
  requiredAuthority: BypassAuthority
): boolean {
  if (requiredAuthority === "FIRE_OFFICER") return actorRoleKeys.includes("FIRE_OFFICER");
  const requiredRank = BYPASS_AUTHORITY_RANK[requiredAuthority];
  return actorRoleKeys.some((key) => roleKeyBypassRank(key) >= requiredRank);
}

/**
 * Only the Project Sponsor can approve or reject a gate under normal
 * conditions. No other role can — confirmed, hard role-locked.
 */
export function canDecideGate(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.includes("SPONSOR");
}

/**
 * The gate-closure AND condition: every blocking deliverable must be
 * either evidenced or bypassed, AND every blocking compliance
 * requirement must be either evidenced or overridden, AND every
 * blocking spend record must be approved, before the gate can move to
 * Sponsor decision. Delivery, compliance and spend are distinct,
 * concurrently-running checks (PRD.html §05, extended by
 * FinancialModel.html's gate-level revision) — all three must clear,
 * none substitutes for another.
 */
export function isGateReadyForSponsor(
  deliverables: { status: DeliverableStatus; blocksGate: boolean }[],
  complianceRequirements: { status: ComplianceRequirementStatus; blocksGate: boolean }[] = [],
  spendRecords: { status: SpendRecordStatus; blocksGate: boolean }[] = []
): boolean {
  const deliveryReady = deliverables.every(
    (d) => !d.blocksGate || d.status === "EVIDENCED" || d.status === "BYPASSED"
  );
  const complianceReady = complianceRequirements.every(
    (c) => !c.blocksGate || c.status === "EVIDENCED" || c.status === "OVERRIDDEN"
  );
  const spendReady = spendRecords.every((s) => !s.blocksGate || s.status === "APPROVED");
  return deliveryReady && complianceReady && spendReady;
}

/**
 * Who can record spend against a gate — locked to the Finance role,
 * the same "domain owner enters, someone else approves" split as
 * Compliance (Compliance Officer authors rules; PM/CO/SRO evidence
 * them).
 */
export function canRecordSpend(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.includes("FINANCE");
}

/**
 * Spend approval is Sponsor/SRO only (FinancialModel.html) — the same
 * pair with standing to close a gate at all, since an approved spend
 * record is now part of that closure.
 */
export function canApproveSpend(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.includes("SPONSOR") || actorRoleKeys.includes("SRO");
}

/**
 * Recording a lesson learned is deliberately open to any role holder
 * on the project — unlike every other action in this file, it's
 * reflective knowledge capture, not a governance decision with one
 * clear owner. The whole point is a wide range of perspectives (PM,
 * Compliance Officer, Principal Designer, ...), so this only checks
 * that the actor is a legitimate stakeholder on this project at all.
 */
export function canRecordLessonLearned(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.length > 0;
}

/**
 * Managing the portfolio view's scheduled-report distribution lists is
 * a governance action (it decides who gets standing visibility into
 * every project's cost/gate/deliverable status), not a per-project
 * one — checked against global role keys (session.ts's
 * getCurrentUserGlobalRoleKeys), the same "holds this role anywhere"
 * standing used for Compliance Officer authority before a project has
 * its own role assignments. Client Authority added (confirmed by
 * Kevin, 20 Aug 2026) — the NHS side commissioning the work has the
 * same standing interest in who sees portfolio status as the SRO does.
 */
export function canManageScheduledReports(actorGlobalRoleKeys: string[]): boolean {
  return (
    actorGlobalRoleKeys.includes("SRO") ||
    actorGlobalRoleKeys.includes("COMPLIANCE_OFFICER") ||
    actorGlobalRoleKeys.includes("CLIENT_AUTHORITY")
  );
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function outstandingSpendCount(
  spendRecords: { status: SpendRecordStatus; blocksGate: boolean }[]
): number {
  return spendRecords.filter((s) => s.blocksGate && s.status === "PENDING").length;
}

/**
 * Who can supply evidence against a compliance requirement — reads the
 * same as canUploadEvidence's delivery reasoning: the PM does the
 * day-to-day work, the Compliance Officer owns the rule set it came
 * from, and the SRO can act at every tier below it too.
 */
export function canUploadComplianceEvidence(actorRoleKeys: string[]): boolean {
  return (
    actorRoleKeys.includes("PM") ||
    actorRoleKeys.includes("COMPLIANCE_OFFICER") ||
    actorRoleKeys.includes("SRO")
  );
}

/**
 * Overriding a blocked compliance requirement is locked to the SRO
 * role only (PRD.html §06) — unlike a deliverable bypass, there's no
 * Compliance Officer tier for this action, since the Compliance
 * Officer authored the rule being overridden.
 *
 * Exception: a requirement whose overrideAuthority is FIRE_OFFICER
 * (see ComplianceRequirement.overrideAuthority) requires the Fire
 * Officer role specifically — SRO does not qualify, same reasoning as
 * canBypassDeliverable's FIRE_OFFICER case.
 */
export function canOverrideCompliance(
  actorRoleKeys: string[],
  requiredAuthority: BypassAuthority = "SRO"
): boolean {
  if (requiredAuthority === "FIRE_OFFICER") return actorRoleKeys.includes("FIRE_OFFICER");
  return actorRoleKeys.includes("SRO");
}

/**
 * Who can upload evidence against a deliverable. Not precisely
 * specified in the PRD beyond "the PM uploads" — extended here to
 * whoever could also bypass this specific item, since the design
 * screens show a Compliance Officer choosing between uploading real
 * evidence or bypassing on a legally significant item. Revisit if
 * that reading turns out wrong.
 */
export function canUploadEvidence(
  actorRoleKeys: string[],
  requiredBypassAuthority: BypassAuthority
): boolean {
  return actorRoleKeys.includes("PM") || canBypassDeliverable(actorRoleKeys, requiredBypassAuthority);
}

export function outstandingDeliverableCount(
  deliverables: { status: DeliverableStatus; blocksGate: boolean }[]
): number {
  return deliverables.filter((d) => d.blocksGate && d.status === "PENDING").length;
}

export function outstandingComplianceCount(
  complianceRequirements: { status: ComplianceRequirementStatus; blocksGate: boolean }[]
): number {
  return complianceRequirements.filter((c) => c.blocksGate && c.status === "PENDING").length;
}

/**
 * The gap ResourceCapacityModel.html §04 found: StageForge has no
 * "project finished" status. Rather than add one, a project only
 * counts toward the resource view while at least one of its Gates
 * isn't yet SIGNED_OFF — no schema change, reuses data that already
 * exists. A project with zero instantiated Gates (e.g. still DRAFT)
 * is vacuously not live by this definition, which is correct: nobody
 * has committed to it yet.
 */
export function isProjectStillLive(gates: { status: GateStatus }[]): boolean {
  return gates.some((g) => g.status !== "SIGNED_OFF");
}

/**
 * Setting a gate's planned dates is PM-only — same authority as
 * setResourceAllocation, since this is planning input, not a
 * governance decision requiring sign-off.
 */
export function canSetGateTimeline(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.includes("PM");
}

export type GateTimelineStatus =
  | "NO_TARGET"
  | "NOT_STARTED_ON_TRACK"
  | "NOT_STARTED_OVERDUE"
  | "IN_PROGRESS_ON_TRACK"
  | "IN_PROGRESS_OVERDUE"
  | "COMPLETED_ON_TIME"
  | "COMPLETED_LATE";

/**
 * Planned-vs-actual health for one gate. Target dates are PM-set
 * planning input; actual dates are stamped automatically by the app
 * (see startGateUpdate/decide() in actions.ts), never user-entered —
 * so comparing them is comparing plan against what really happened,
 * not plan against a number someone typed in after the fact.
 */
export function gateTimelineStatus(
  gate: {
    status: GateStatus;
    targetStartDate: Date | null;
    targetEndDate: Date | null;
    actualEndDate: Date | null;
  },
  now: Date = new Date()
): GateTimelineStatus {
  if (!gate.targetStartDate && !gate.targetEndDate) return "NO_TARGET";

  if (gate.status === "SIGNED_OFF") {
    if (!gate.targetEndDate || !gate.actualEndDate) return "NO_TARGET";
    return gate.actualEndDate <= gate.targetEndDate ? "COMPLETED_ON_TIME" : "COMPLETED_LATE";
  }

  if (gate.status === "NOT_STARTED") {
    return gate.targetStartDate && now > gate.targetStartDate ? "NOT_STARTED_OVERDUE" : "NOT_STARTED_ON_TRACK";
  }

  // IN_PROGRESS or AWAITING_SPONSOR
  return gate.targetEndDate && now > gate.targetEndDate ? "IN_PROGRESS_OVERDUE" : "IN_PROGRESS_ON_TRACK";
}

export const GATE_TIMELINE_LABELS: Record<GateTimelineStatus, string> = {
  NO_TARGET: "No target set",
  NOT_STARTED_ON_TRACK: "Not started",
  NOT_STARTED_OVERDUE: "Should have started",
  IN_PROGRESS_ON_TRACK: "On track",
  IN_PROGRESS_OVERDUE: "Overdue",
  COMPLETED_ON_TIME: "Completed on time",
  COMPLETED_LATE: "Completed late",
};

// Tailwind classes to render each status as an attention-appropriate
// colour — grey for "not due yet", green for healthy, amber for a
// completed-but-late or not-yet-started-but-should-have soft warning,
// red for actively overdue. Matches the same ok/warn/risk vocabulary
// used for Delivery/Compliance/Spend elsewhere on this page.
export const GATE_TIMELINE_BAR_CLASS: Record<GateTimelineStatus, string> = {
  NO_TARGET: "bg-rule",
  NOT_STARTED_ON_TRACK: "bg-inkmuted/50",
  NOT_STARTED_OVERDUE: "bg-warn",
  IN_PROGRESS_ON_TRACK: "bg-accent",
  IN_PROGRESS_OVERDUE: "bg-risk",
  COMPLETED_ON_TIME: "bg-ok",
  COMPLETED_LATE: "bg-warn",
};

export const GATE_TIMELINE_TEXT_CLASS: Record<GateTimelineStatus, string> = {
  NO_TARGET: "text-inkmuted",
  NOT_STARTED_ON_TRACK: "text-inkmuted",
  NOT_STARTED_OVERDUE: "text-warn",
  IN_PROGRESS_ON_TRACK: "text-accent",
  IN_PROGRESS_OVERDUE: "text-risk",
  COMPLETED_ON_TIME: "text-ok",
  COMPLETED_LATE: "text-warn",
};
