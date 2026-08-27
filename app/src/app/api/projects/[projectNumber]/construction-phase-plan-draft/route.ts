// Serves a generated Construction Phase Plan draft .docx for a project
// — see src/lib/constructionPhasePlanDraft.ts for the content design
// and src/lib/documentTemplateRoadmap.ts for where this fits in the
// wider "auto-filled deliverable drafts" roadmap. Copy-paste-adapted
// from pci-draft/route.ts (this codebase's established convention for
// these draft routes — see risk-register-draft/route.ts, which does
// the same rather than sharing a helper).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentUserRoleKeysForProject, getCurrentUserGlobalRoleKeys } from "@/lib/session";
import { canUploadEvidence } from "@/lib/permissions";
import { effectiveComplianceTags, HAISCRIBE_HIGH_INTENSITY_TAG } from "@/lib/cdm";
import { buildCppSections } from "@/lib/constructionPhasePlanDraft";
import { renderDraftDocx } from "@/lib/docDraft";

export async function GET(_request: Request, { params }: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return new NextResponse("Not signed in.", { status: 401 });

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      template: true,
      additionalTemplates: { include: { template: true } },
      roleAssignments: { include: { role: true, user: true, department: { include: { company: true } } } },
      stages: { include: { gate: { select: { targetStartDate: true, targetEndDate: true } } } },
    },
  });
  if (!project) return new NextResponse("Project not found.", { status: 404 });

  const [roleKeys, globalRoleKeys, allRoles] = await Promise.all([
    getCurrentUserRoleKeysForProject(project.id),
    getCurrentUserGlobalRoleKeys(),
    db.role.findMany(),
  ]);
  const exactMatchAuthorityKeys = new Set(allRoles.filter((r) => r.isExactMatchAuthority).map((r) => r.key));
  // Same authority the Construction Phase Plan deliverable's own
  // upload/bypass controls use (bypassAuthority defaults to "PM") —
  // whoever could upload evidence for that item can also generate its
  // draft.
  if (!canUploadEvidence(roleKeys, "PM", exactMatchAuthorityKeys, globalRoleKeys)) {
    return new NextResponse("You don't have permission to generate this draft.", { status: 403 });
  }

  const constituentTemplates = [project.template, ...project.additionalTemplates.map((a) => a.template)];
  const tagsWithDerived = effectiveComplianceTags(project, constituentTemplates.map((t) => t.key));

  const fmContractor = project.roleAssignments.find((a) => a.role.key === "FM_CONTRACTOR");
  const clientAuthority = project.roleAssignments.find((a) => a.role.key === "CLIENT_AUTHORITY");
  const principalDesigner = project.roleAssignments.find((a) => a.role.key === "PRINCIPAL_DESIGNER");
  const principalContractor = project.roleAssignments.find((a) => a.role.key === "PRINCIPAL_CONTRACTOR");

  const gateTargetStarts = project.stages.map((s) => s.gate?.targetStartDate).filter((d): d is Date => d !== null && d !== undefined);
  const gateTargetEnds = project.stages.map((s) => s.gate?.targetEndDate).filter((d): d is Date => d !== null && d !== undefined);

  const sections = buildCppSections({
    projectName: project.name,
    projectNumber: project.projectNumber,
    brief: project.provisioningBrief,
    worksType: project.worksType,
    constituentTemplateNames: constituentTemplates.map((t) => t.name),
    clientAuthorityName: clientAuthority?.department.company.name ?? null,
    fmContractorName: fmContractor?.department.company.name ?? null,
    principalDesignerName: principalDesigner?.user.name ?? null,
    principalContractorName: principalContractor?.user.name ?? null,
    roleAssignments: project.roleAssignments.map((a) => ({
      roleName: a.role.name,
      userName: a.user.name,
      companyName: a.department.company.name,
    })),
    earliestTargetStart: gateTargetStarts.length > 0 ? new Date(Math.min(...gateTargetStarts.map((d) => d.getTime()))) : null,
    latestTargetEnd: gateTargetEnds.length > 0 ? new Date(Math.max(...gateTargetEnds.map((d) => d.getTime()))) : null,
    isHaiScribeIntensive: tagsWithDerived.includes(HAISCRIBE_HIGH_INTENSITY_TAG),
    generatedByName: currentUser.name,
    generatedDate: new Date(),
  });

  const buffer = await renderDraftDocx(sections);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="CPP-${project.projectNumber}-draft.docx"`,
    },
  });
}
