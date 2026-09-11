// The AI Council mailbox pipeline polls this to discover EmailApproval
// requests that need an actual email sent (Phase 2, PRD.html §06). Read-
// only — sending the email and confirming via POST .../sent is a
// separate step, so a network failure between "read pending" and
// "actually sent" never gets silently lost as a false-positive send.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function GET(request: Request) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const pending = await db.emailApproval.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    include: {
      contact: { select: { name: true, email: true, roleKey: true, accountability: true } },
      gate: { select: { name: true, key: true, stage: { select: { project: { select: { name: true, projectNumber: true } } } } } },
      requestedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({
    pending: pending.map((ea) => ({
      id: ea.id,
      requestToken: ea.requestToken,
      requestedAt: ea.requestedAt.toISOString(),
      contact: ea.contact,
      gateName: ea.gate.name,
      gateKey: ea.gate.key,
      projectName: ea.gate.stage.project.name,
      projectNumber: ea.gate.stage.project.projectNumber,
      requestedByName: ea.requestedBy.name,
    })),
  });
}
