// Phase 5 extended (PRD.html §06/§09) — mirrors POST
// /api/document-reviews/[id]/started exactly: the AI Council side calls this
// once it has picked up a PENDING request and is about to run the agent, so
// a concurrent poll never processes the same request twice.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const body = await request.json().catch(() => ({}));
  if (String(body.requestToken ?? "") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }

  const generation = await db.documentGenerationRequest.findUnique({ where: { requestToken } });
  if (!generation) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (generation.status !== "PENDING") {
    return NextResponse.json({ error: `Already ${generation.status}, not PENDING.` }, { status: 409 });
  }

  await db.documentGenerationRequest.update({
    where: { id: generation.id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
