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
  "CLINICAL_SAFETY_OFFICER",
  "INFORMATION_GOVERNANCE_OFFICER",
  "PRINCIPAL_DESIGNER",
  "FM_CONTRACTOR",
];

// Exact-match authorities: not even SRO qualifies — only the named
// role does. Kept as a set so canBypassDeliverable/canOverrideCompliance
// share one place that knows which BypassAuthority values work this way.
export const EXACT_MATCH_AUTHORITIES: BypassAuthority[] = [
  "FIRE_OFFICER",
  "AUTHORISED_PERSON_ELECTRICAL",
  "AUTHORISED_PERSON_WATER",
  "AUTHORISED_PERSON_VENTILATION",
  "AUTHORISED_PERSON_MEDICAL_GASES",
  "CLINICAL_SAFETY_OFFICER",
  "INFORMATION_GOVERNANCE_OFFICER",
];

export const BYPASS_AUTHORITY_LABEL: Record<BypassAuthority, string> = {
  PM: "PM",
  COMPLIANCE_OFFICER: "Compliance Officer",
  SRO: "SRO",
  FIRE_OFFICER: "Fire Officer",
  AUTHORISED_PERSON_ELECTRICAL: "Electrical AP",
  AUTHORISED_PERSON_WATER: "Water AP",
  AUTHORISED_PERSON_VENTILATION: "Heating & Ventilation AP",
  AUTHORISED_PERSON_MEDICAL_GASES: "Medical Gases AP",
  CLINICAL_SAFETY_OFFICER: "Clinical Safety Officer",
  INFORMATION_GOVERNANCE_OFFICER: "Information Governance Officer",
};

/**
 * Can a user holding these roles (on this project) bypass a
 * deliverable that requires `requiredAuthority`?
 *
 * SRO is the one apex role: it can bypass a PM-tier or
 * Compliance-Officer-tier item, same as it can override compliance.
 * Below SRO there is deliberately no ladder — PM and Compliance
 * Officer are two separate tiers, not one inheriting the other.
 * Corrected by Kevin, 21 Aug 2026, after live testing on the Main
 * Kitchen Drainage project found a Compliance Officer able to bypass
 * ordinary PM-managed deliverables that had nothing to do with
 * compliance: a Compliance Officer authors and evidences the
 * compliance-flagged items, and that's the extent of their bypass
 * standing — it does not extend to items the PM manages day to day.
 * Every bypass, at any authority level, requires a written reason
 * (enforced at the call site — see actions.ts — not here).
 *
 * FIRE_OFFICER and the AUTHORISED_PERSON_* authorities are exact-match
 * requirements, not reachable by SRO either — confirmed by Kevin,
 * 20 Aug 2026 (fire) and 21 Aug 2026 (electrical/water AP): an SRO has
 * no professional standing to assess fire safety, authorise an
 * electrical isolation, or sign off water disinfection, so unlike
 * every other tier here, SRO does NOT automatically qualify for one of
 * these items — only the named role does.
 */
export function canBypassDeliverable(
  actorRoleKeys: string[],
  requiredAuthority: BypassAuthority
): boolean {
  if (EXACT_MATCH_AUTHORITIES.includes(requiredAuthority)) return actorRoleKeys.includes(requiredAuthority);
  if (requiredAuthority === "SRO") return actorRoleKeys.includes("SRO");
  return actorRoleKeys.includes("SRO") || actorRoleKeys.includes(requiredAuthority);
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
 * Who can record spend against a gate — the PM, same as deliverable/
 * compliance evidence (canUploadEvidence/canUploadComplianceEvidence):
 * the PM does the day-to-day work of logging what's been spent, and
 * SRO can act at every tier below it too. Finance no longer records —
 * it owns the approval step instead (confirmed by Kevin, 22 Aug 2026:
 * in practice the PM enters spend and Finance checks it, not the
 * other way round).
 */
export function canRecordSpend(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.includes("PM") || actorRoleKeys.includes("SRO");
}

/**
 * Spend approval is Finance/SRO (confirmed by Kevin, 22 Aug 2026) —
 * Finance is the domain owner checking what the PM logged, and SRO
 * retains its usual standing to act at every tier below it. Sponsor
 * dropped: its role in this app is the gate-level sign-off decision
 * (canDecideGate), not line-item spend approval — those are two
 * separate checks that both have to clear (isGateReadyForSponsor)
 * before a gate can close, not one role rubber-stamping the other.
 */
export function canApproveSpend(actorRoleKeys: string[]): boolean {
  return actorRoleKeys.includes("FINANCE") || actorRoleKeys.includes("SRO");
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
 * Exception: a requirement whose overrideAuthority is FIRE_OFFICER or
 * one of the AUTHORISED_PERSON_* values (see
 * ComplianceRequirement.overrideAuthority) requires that role
 * specifically — SRO does not qualify, same reasoning as
 * canBypassDeliverable's exact-match case.
 */
export function canOverrideCompliance(
  actorRoleKeys: string[],
  requiredAuthority: BypassAuthority = "SRO"
): boolean {
  if (EXACT_MATCH_AUTHORITIES.includes(requiredAuthority)) return actorRoleKeys.includes(requiredAuthority);
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
