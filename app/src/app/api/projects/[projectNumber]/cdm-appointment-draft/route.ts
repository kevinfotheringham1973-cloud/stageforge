// Serves a generated CDM 2015 appointment-form draft .docx for a project
// — see src/lib/cdmAppointmentDraft.ts for the content design. A GET
// Route Handler rather than a Server Action, same reasoning as
// pci-draft/route.ts (a binary file download doesn't fit the Server
// Action response shape). ?role=PRINCIPAL_DESIGNER|PRINCIPAL_CONTRACTOR
// selects which of the two Reg 5(1) appointments to draft — the two
// compliance requirements that use this (comp.cdm_principal_designer_
// appointed, comp.cdm_principal_contractor_appointed) pass their own role
// directly, so this route never has to guess which one a PM meant.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentUserRoleKeysForProject } from "@/lib/session";
import { canUploadComplianceEvidence } from "@/lib/permissions";
import { buildCdmAppointmentBlocks, renderCdmAppointmentDocx, type CdmAppointmentRole } from "@/lib/cdmAppointmentDraft";

export async function GET(request: Request, { params }: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await params;
  const roleParam = new URL(request.url).searchParams.get("role");
  if (roleParam !== "PRINCIPAL_DESIGNER" && roleParam !== "PRINCIPAL_CONTRACTOR") {
    return new NextResponse('Query param "role" must be PRINCIPAL_DESIGNER or PRINCIPAL_CONTRACTOR.', { status: 400 });
  }
  const role: CdmAppointmentRole = roleParam;

  const currentUser = await getCurrentUser();
  if (!currentUser) return new NextResponse("Not signed in.", { status: 401 });

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      roleAssignments: { include: { role: true, user: true, department: { include: { company: true } } } },
    },
  });
  if (!project) return new NextResponse("Project not found.", { status: 404 });

  const [roleKeys, allRoles] = await Promise.all([getCurrentUserRoleKeysForProject(project.id), db.role.findMany()]);
  // Same authority the compliance item's own upload control uses.
  if (!canUploadComplianceEvidence(roleKeys)) {
    return new NextResponse("You don't have permission to generate this draft.", { status: 403 });
  }

  const fmContractor = project.roleAssignments.find((a) => a.role.key === "FM_CONTRACTOR");
  const appointee = project.roleAssignments.find((a) => a.role.key === role);
  const pmAssignment = project.roleAssignments.find((a) => a.role.key === "PM");
  const pmRole = allRoles.find((r) => r.key === "PM");

  const blocks = buildCdmAppointmentBlocks({
    projectName: project.name,
    projectNumber: project.projectNumber,
    role,
    fmContractorName: fmContractor?.department.company.name ?? null,
    appointeeName: appointee?.user.name ?? null,
    leadOfficerRoleLabel: pmRole?.name ?? "PM",
    leadOfficerName: pmAssignment?.user.name ?? currentUser.name,
  });

  const buffer = await renderCdmAppointmentDocx(blocks);
  const roleFileTag = role === "PRINCIPAL_DESIGNER" ? "PrincipalDesigner" : "PrincipalContractor";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="CDM-Appointment-${roleFileTag}-${project.projectNumber}-draft.docx"`,
    },
  });
}
