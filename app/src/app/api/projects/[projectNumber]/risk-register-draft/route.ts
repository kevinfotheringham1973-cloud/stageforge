// Serves a generated Risk Register draft .xlsx for a project — see
// src/lib/riskRegisterDraft.ts for the content design and
// src/lib/documentTemplateRoadmap.ts for where this fits in the wider
// "auto-filled deliverable drafts" roadmap. A GET Route Handler rather
// than a Server Action, since a binary file download doesn't fit the
// Server Action response shape (same pattern as pci-draft/route.ts).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentUserRoleKeysForProject, getCurrentUserGlobalRoleKeys } from "@/lib/session";
import { canUploadEvidence } from "@/lib/permissions";
import { buildRiskRegisterSections, renderRiskRegisterXlsx } from "@/lib/riskRegisterDraft";

export async function GET(_request: Request, { params }: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return new NextResponse("Not signed in.", { status: 401 });

  const project = await db.project.findUnique({ where: { projectNumber } });
  if (!project) return new NextResponse("Project not found.", { status: 404 });

  const [roleKeys, globalRoleKeys, allRoles] = await Promise.all([
    getCurrentUserRoleKeysForProject(project.id),
    getCurrentUserGlobalRoleKeys(),
    db.role.findMany(),
  ]);
  const exactMatchAuthorityKeys = new Set(allRoles.filter((r) => r.isExactMatchAuthority).map((r) => r.key));
  // Same authority every discipline's risk-register deliverable uses
  // (default bypassAuthority "PM", none of them override it) — whoever
  // could upload evidence for that item can also generate its draft.
  if (!canUploadEvidence(roleKeys, "PM", exactMatchAuthorityKeys, globalRoleKeys)) {
    return new NextResponse("You don't have permission to generate this draft.", { status: 403 });
  }

  // One deliverable per constituent template — never canonicalized
  // like the PCI (#82), because the standard risk categories genuinely
  // differ by discipline. Matched by key suffix, not an enumerated
  // list, so a future template automatically picks this up too.
  const riskRegisterDeliverables = await db.deliverable.findMany({
    where: {
      key: { endsWith: "_expanded_risk_register" },
      gate: { stage: { projectId: project.id } },
    },
    select: { key: true, label: true },
  });

  const sections = buildRiskRegisterSections({
    projectName: project.name,
    projectNumber: project.projectNumber,
    riskRegisterDeliverables,
    generatedByName: currentUser.name,
    generatedDate: new Date(),
  });

  const buffer = await renderRiskRegisterXlsx(sections, {
    projectName: project.name,
    projectNumber: project.projectNumber,
    riskRegisterDeliverables,
    generatedByName: currentUser.name,
    generatedDate: new Date(),
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Risk-Register-${project.projectNumber}-draft.xlsx"`,
    },
  });
}
