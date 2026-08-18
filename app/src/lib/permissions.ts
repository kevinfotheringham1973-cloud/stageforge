// Core governance rules, as pure functions — the same logic drawn in
// DataModel.html's gate-closure diagram, made real. Deliberately has
// no DB dependency so it stays trivially testable.

import type { BypassAuthority, DeliverableStatus } from "@prisma/client";

// Authority ladder: SRO can do anything Compliance Officer or PM can
// do (bypass-wise); Compliance Officer can do anything PM can do;
// PM is the floor. A role with no bypass standing at all (Sponsor,
// FM Contractor, Client Authority, ...) ranks -1 and never qualifies.
const BYPASS_AUTHORITY_RANK: Record<BypassAuthority, number> = {
  PM: 0,
  COMPLIANCE_OFFICER: 1,
  SRO: 2,
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
 */
export function canBypassDeliverable(
  actorRoleKeys: string[],
  requiredAuthority: BypassAuthority
): boolean {
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
 * either evidenced or bypassed before the gate can move to Sponsor
 * decision. (Compliance's equivalent condition is Phase 2 — not
 * modelled here yet.)
 */
export function isGateReadyForSponsor(
  deliverables: { status: DeliverableStatus; blocksGate: boolean }[]
): boolean {
  return deliverables.every(
    (d) => !d.blocksGate || d.status === "EVIDENCED" || d.status === "BYPASSED"
  );
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
