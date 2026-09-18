// Serves a blank WSG SBAR template .docx, or its Supporting Detail
// companion, for a project — see src/lib/sbarDraft.ts for the content
// design. ?doc=sbar|supporting-detail selects which of the pair to
// serve; the deliverable card offers both as separate downloads, same as
// the two real examples this was generalised from were always a pair,
// never one merged document.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentUserRoleKeysForProject, getCurrentUserGlobalRoleKeys } from "@/lib/session";
import { canUploadEvidence } from "@/lib/permissions";
import { buildSbarBlocks, buildSbarSupportingDetailBlocks, renderSbarDocx } from "@/lib/sbarDraft";

export async function GET(request: Request, { params }: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await params;
  const doc = new URL(request.url).searchParams.get("doc");
  if (doc !== "sbar" && doc !== "supporting-detail") {
    return new NextResponse('Query param "doc" must be sbar or supporting-detail.', { status: 400 });
  }

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
  // Same authority the SBAR deliverable's own upload/bypass controls use
  // (bypassAuthority "PM", canonicalized in #82).
  if (!canUploadEvidence(roleKeys, "PM", exactMatchAuthorityKeys, globalRoleKeys)) {
    return new NextResponse("You don't have permission to generate this draft.", { status: 403 });
  }

  const input = { projectName: project.name, projectNumber: project.projectNumber, generatedDate: new Date() };
  const blocks = doc === "sbar" ? buildSbarBlocks(input) : buildSbarSupportingDetailBlocks(input);
  const buffer = await renderSbarDocx(blocks);
  const fileTag = doc === "sbar" ? "SBAR" : "SBAR-Supporting-Detail";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileTag}-${project.projectNumber}-draft.docx"`,
    },
  });
}
