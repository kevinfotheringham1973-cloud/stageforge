// Phase 4 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline polls this to discover EmailApproval requests
// that have gone quiet and are due either a reminder to the same contact(s),
// an advance to the next escalation tier, or a final notification to
// whoever requested the approval. Read-only, same split as GET .../pending:
// this only reports what's due, the caller sends the actual email and
// confirms back via POST .../reminded, .../advance-tier, or .../escalated.
//
// Generalised 12 Sep 2026 (PRD.html §06/§09 Phase 5 extended): each
// candidate's wait/reminder thresholds now come from its own
// ApprovalRoutingTier config (per role, per project), not the fixed global
// constants Phase 4 shipped with. And "ESCALATE" from computeOverdueAction
// is no longer automatically the final word — this route checks whether a
// next tier actually exists for this case's role: if so, the real action is
// "ADVANCE_TIER" (the case moves to real new contacts, or a genuinely more
// senior role); only when no further tier is configured does it fall back
// to today's original "ESCALATE" behaviour (notify the requester, mechanism
// exhausted, never touches the gate).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";
import { computeOverdueAction } from "@/lib/emailApprovalEscalation";

export async function GET(request: Request) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const candidates = await db.emailApproval.findMany({
    where: { status: "SENT", escalatedAt: null },
    orderBy: { sentAt: "asc" },
    include: {
      contact: { select: { name: true, email: true, roleKey: true, accountability: true } },
      gate: {
        select: {
          name: true,
          key: true,
          stage: { select: { projectId: true, project: { select: { name: true, projectNumber: true } } } },
        },
      },
      requestedBy: { select: { name: true, email: true } },
    },
  });
  if (candidates.length === 0) return NextResponse.json({ overdue: [] });

  // Batch-fetch every (projectId, roleKey, tier) and (projectId, roleKey,
  // tier+1) combination actually in play, once, rather than per-candidate —
  // a real project realistically has very few distinct roles/tiers at once.
  const relevantTiers = await db.approvalRoutingTier.findMany({
    where: {
      OR: candidates.flatMap((ea) => [
        { projectId: ea.gate.stage.projectId, roleKey: ea.roleKey, tier: ea.tier },
        { projectId: ea.gate.stage.projectId, roleKey: ea.roleKey, tier: ea.tier + 1 },
      ]),
    },
  });
  const tierByKey = new Map(relevantTiers.map((t) => [`${t.projectId}::${t.roleKey}::${t.tier}`, t]));

  const now = new Date();
  const overdue = candidates
    .map((ea) => {
      const currentTier = tierByKey.get(`${ea.gate.stage.projectId}::${ea.roleKey}::${ea.tier}`);
      const waitMs = (currentTier?.waitHours ?? 72) * 60 * 60 * 1000;
      const maxReminders = currentTier?.maxRemindersBeforeAdvancing ?? 2;
      const rawAction = computeOverdueAction(ea, now, { waitMs, maxReminders });
      if (!rawAction) return null;

      let action: "REMIND" | "ADVANCE_TIER" | "ESCALATE" = rawAction;
      if (rawAction === "ESCALATE") {
        const nextTierExists = tierByKey.has(`${ea.gate.stage.projectId}::${ea.roleKey}::${ea.tier + 1}`);
        action = nextTierExists ? "ADVANCE_TIER" : "ESCALATE";
      }

      return {
        id: ea.id,
        requestToken: ea.requestToken,
        caseId: ea.caseId,
        roleKey: ea.roleKey,
        tier: ea.tier,
        sentAt: ea.sentAt!.toISOString(),
        reminderCount: ea.reminderCount,
        lastReminderAt: ea.lastReminderAt?.toISOString() ?? null,
        contact: ea.contact,
        gateName: ea.gate.name,
        gateKey: ea.gate.key,
        projectName: ea.gate.stage.project.name,
        projectNumber: ea.gate.stage.project.projectNumber,
        requestedByName: ea.requestedBy.name,
        requestedByEmail: ea.requestedBy.email,
        action,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ overdue });
}
