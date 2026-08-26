// The "Mandatory Approvals Tracker" (26 Aug 2026) — a per-project,
// read-only view answering "which Safety Group/AE/AP must sign off,
// and have they yet" (Project Roles and Responsibilities Template.docx's
// own recommendation). Deliberately NOT built from
// neededDisciplineRoleKeys (disciplineTeam.ts) — that helper excludes
// standing-team authorities (SRO, FIRE_OFFICER, COMPLIANCE_OFFICER) on
// purpose, since it only drives *suggesting new team members*, but the
// source doc's own "Core Mandatory Roles" table names Fire Safety
// Advisor and "PFI Board/NHS Cost Approval" (-> FIRE_OFFICER/SRO here)
// as mandatory too. So this scans every authority key actually in play
// on the project's own live Deliverable/ComplianceRequirement rows
// (bypassAuthority / overrideAuthority / additionalApproverRoleKeys),
// excluding only "PM" — accurate for a merged project
// (ProjectAdditionalTemplate) too, since it reads the live state, not
// any one constituent Template.
import type { GateStatus, PrismaClient, RoleCategory } from "@prisma/client";

export type ApprovalItemStatus = "PENDING" | "EVIDENCED" | "BYPASSED" | "OVERRIDDEN";

export type ApprovalItem = {
  gateId: string;
  gateName: string;
  stageName: string;
  key: string;
  label: string;
  kind: "deliverable" | "compliance" | "compliance-cosign";
  status: ApprovalItemStatus;
  // Carried through so the page can reuse permissions.ts's
  // gateTimelineStatus for a health badge, rather than a bare date.
  gateStatus: GateStatus;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  actualEndDate: Date | null;
};

export type ApprovalRoleRow = {
  roleKey: string;
  roleName: string;
  category: RoleCategory;
  isExactMatchAuthority: boolean;
  assignedUsers: { name: string; email: string }[];
  items: ApprovalItem[];
};

type StageForTracker = {
  name: string;
  gate: {
    id: string;
    name: string;
    status: GateStatus;
    targetStartDate: Date | null;
    targetEndDate: Date | null;
    actualEndDate: Date | null;
    deliverables: { key: string; label: string; status: "PENDING" | "EVIDENCED" | "BYPASSED"; bypassAuthority: string }[];
    complianceRequirements: {
      key: string;
      label: string;
      status: "PENDING" | "EVIDENCED" | "OVERRIDDEN";
      overrideAuthority: string;
      additionalApproverRoleKeys: string[];
      coSignOffs: { roleKey: string }[];
    }[];
  } | null;
};

export async function getMandatoryApprovalTracker(
  db: PrismaClient,
  project: {
    roleAssignments: { role: { key: string }; user: { name: string; email: string } }[];
    stages: StageForTracker[];
  }
): Promise<{ holdPoints: ApprovalItem[]; roleRows: ApprovalRoleRow[] }> {
  const itemsByRoleKey = new Map<string, ApprovalItem[]>();
  const holdPoints: ApprovalItem[] = [];

  const addItem = (roleKey: string, item: ApprovalItem) => {
    if (roleKey === "PM") return;
    if (!itemsByRoleKey.has(roleKey)) itemsByRoleKey.set(roleKey, []);
    itemsByRoleKey.get(roleKey)!.push(item);
  };

  for (const stage of project.stages) {
    const gate = stage.gate;
    if (!gate) continue;

    const gateTiming = {
      gateStatus: gate.status,
      targetStartDate: gate.targetStartDate,
      targetEndDate: gate.targetEndDate,
      actualEndDate: gate.actualEndDate,
    };

    for (const d of gate.deliverables) {
      const item: ApprovalItem = {
        gateId: gate.id,
        gateName: gate.name,
        stageName: stage.name,
        key: d.key,
        label: d.label,
        kind: "deliverable",
        status: d.status,
        ...gateTiming,
      };
      addItem(d.bypassAuthority, item);
      if (d.key.endsWith("_pre_contract_hold_point")) holdPoints.push(item);
    }

    for (const c of gate.complianceRequirements) {
      addItem(c.overrideAuthority, {
        gateId: gate.id,
        gateName: gate.name,
        stageName: stage.name,
        key: c.key,
        label: c.label,
        kind: "compliance",
        status: c.status,
        ...gateTiming,
      });
      // Additional approvers (multi-party sign-off, see
      // ComplianceCoSignOff) each independently sign off on top of the
      // primary overrideAuthority above — tracked here as a separate
      // per-role item, "signed" (EVIDENCED) or not (PENDING), since a
      // co-sign has no bypass/override state of its own.
      const signedRoles = new Set(c.coSignOffs.map((s) => s.roleKey));
      for (const roleKey of c.additionalApproverRoleKeys) {
        addItem(roleKey, {
          gateId: gate.id,
          gateName: gate.name,
          stageName: stage.name,
          key: `${c.key}.cosign.${roleKey}`,
          label: `${c.label} (co-sign)`,
          kind: "compliance-cosign",
          status: signedRoles.has(roleKey) ? "EVIDENCED" : "PENDING",
          ...gateTiming,
        });
      }
    }
  }

  const roleKeys = Array.from(itemsByRoleKey.keys());
  const roles = roleKeys.length > 0 ? await db.role.findMany({ where: { key: { in: roleKeys } } }) : [];
  const assignedUsersByRoleKey = new Map<string, { name: string; email: string }[]>();
  for (const a of project.roleAssignments) {
    if (!assignedUsersByRoleKey.has(a.role.key)) assignedUsersByRoleKey.set(a.role.key, []);
    assignedUsersByRoleKey.get(a.role.key)!.push({ name: a.user.name, email: a.user.email });
  }

  const roleRows: ApprovalRoleRow[] = roles.map((r) => ({
    roleKey: r.key,
    roleName: r.name,
    category: r.category,
    isExactMatchAuthority: r.isExactMatchAuthority,
    assignedUsers: assignedUsersByRoleKey.get(r.key) ?? [],
    items: itemsByRoleKey.get(r.key) ?? [],
  }));

  return { holdPoints, roleRows };
}
