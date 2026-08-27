// Serves a generated PCI (Pre-Construction Information) draft .docx
// for a project — see src/lib/pciDraft.ts for the content design and
// src/lib/documentTemplateRoadmap.ts for where this fits in the wider
// "auto-filled deliverable drafts" roadmap. A GET Route Handler rather
// than a Server Action, since a binary file download doesn't fit the
// Server Action response shape.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentUserRoleKeysForProject, getCurrentUserGlobalRoleKeys } from "@/lib/session";
import { canUploadEvidence } from "@/lib/permissions";
import { constituentTemplateIds } from "@/lib/projectTemplates";
import { neededDisciplineRoleKeys } from "@/lib/disciplineTeam";
import { effectiveComplianceTags, HAISCRIBE_HIGH_INTENSITY_TAG } from "@/lib/cdm";
import { buildPciSections, renderPciDocx } from "@/lib/pciDraft";

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
  // Same authority the PCI deliverable's own upload/bypass controls use
  // (its bypassAuthority is "PM", canonicalized in #82) — whoever could
  // upload evidence for that item can also generate its draft.
  if (!canUploadEvidence(roleKeys, "PM", exactMatchAuthorityKeys, globalRoleKeys)) {
    return new NextResponse("You don't have permission to generate this draft.", { status: 403 });
  }

  const templateIds = constituentTemplateIds(project);
  const constituentTemplates = [project.template, ...project.additionalTemplates.map((a) => a.template)];
  const neededRoleKeys = await neededDisciplineRoleKeys(templateIds, project.worksType);
  const tagsWithDerived = effectiveComplianceTags(project, constituentTemplates.map((t) => t.key));

  const fmContractor = project.roleAssignments.find((a) => a.role.key === "FM_CONTRACTOR");
  const clientAuthority = project.roleAssignments.find((a) => a.role.key === "CLIENT_AUTHORITY");
  const principalDesigner = project.roleAssignments.find((a) => a.role.key === "PRINCIPAL_DESIGNER");

  const gateTargetStarts = project.stages.map((s) => s.gate?.targetStartDate).filter((d): d is Date => d !== null && d !== undefined);
  const gateTargetEnds = project.stages.map((s) => s.gate?.targetEndDate).filter((d): d is Date => d !== null && d !== undefined);

  const sections = buildPciSections({
    projectName: project.name,
    projectNumber: project.projectNumber,
    brief: project.provisioningBrief,
    worksType: project.worksType,
    notifiableUnderCdm: project.notifiableUnderCdm,
    constituentTemplateNames: constituentTemplates.map((t) => t.name),
    neededRoleKeys,
    fmContractorName: fmContractor?.department.company.name ?? null,
    clientAuthorityName: clientAuthority?.department.company.name ?? null,
    principalDesignerName: principalDesigner?.user.name ?? null,
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

  const buffer = await renderPciDocx(sections);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="PCI-${project.projectNumber}-draft.docx"`,
    },
  });
}
