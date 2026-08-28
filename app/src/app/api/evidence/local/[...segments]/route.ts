// Serves files saved by localEvidenceStorage.ts (the desktop build's
// SharePoint replacement — see that file's header comment). Only ever
// reached when STAGEFORGE_LOCAL_MODE is set; the real deployed app never
// writes anything here so this 404s harmlessly if hit.
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentUserId } from "@/lib/session";
import { resolveLocalEvidencePath } from "@/lib/localEvidenceStorage";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
};

export async function GET(_request: Request, { params }: { params: Promise<{ segments: string[] }> }) {
  // Belt-and-braces on top of proxy.ts's own auth gate (see its header
  // comment) — evidence can be genuinely sensitive (fire risk
  // assessments, compliance sign-off documents).
  const userId = await getCurrentUserId();
  if (!userId) return new NextResponse("Not signed in.", { status: 401 });

  const { segments } = await params;
  const filePath = resolveLocalEvidencePath(segments);
  if (!filePath) return new NextResponse("Invalid path.", { status: 400 });

  try {
    const data = await fs.readFile(filePath);
    const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": contentType } });
  } catch {
    return new NextResponse("File not found.", { status: 404 });
  }
}
