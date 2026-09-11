// The AI Council mailbox pipeline calls this once it has genuinely sent
// the email (Phase 2, PRD.html §06) — separate from GET .../pending so a
// send failure never gets marked SENT by mistake. requestToken must be
// supplied and match, not just the id, so this can't be used to mark an
// arbitrary approval sent without having actually fetched it via the
// pending endpoint first.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const requestToken = String(body.requestToken ?? "");

  const emailApproval = await db.emailApproval.findUnique({ where: { id } });
  if (!emailApproval || emailApproval.requestToken !== requestToken) {
    return NextResponse.json({ error: "No matching pending request for that id/token." }, { status: 404 });
  }
  if (emailApproval.status !== "PENDING") {
    return NextResponse.json({ error: `Already ${emailApproval.status}, not PENDING.` }, { status: 409 });
  }

  await db.emailApproval.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
