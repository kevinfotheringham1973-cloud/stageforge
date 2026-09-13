import type { EvidenceFileKind } from "@prisma/client";

type EvidenceFileLite = {
  id: string;
  fileName: string;
  kind: EvidenceFileKind;
  version: number;
  uploadedAt: Date;
};

type RequestLite = {
  id: string;
  agentSlug: string;
  status: string;
};

/**
 * Read-only "what evidence exists for this deliverable" summary — real
 * SUBMITTED file history, AI_REVIEW/AI_DRAFT files, any still-running
 * requests, and an explicit "No evidence yet" state when there's
 * genuinely nothing. Built for the project-wide Evidence page (added
 * 13 Sep 2026, per Kevin's real-user review of live project #30004: two
 * of Gate 0's three deliverables had no evidence at all, and nothing on
 * the gate page said so — a PM had no way to see that gap without
 * opening each deliverable one at a time). GateDetail.tsx keeps its own
 * richer, action-integrated rendering of this same data (upload/review/
 * generate forms, result summaries) for the single-gate working view —
 * this component is deliberately just the at-a-glance version.
 */
export function DeliverableEvidenceSummary({
  evidenceFiles,
  documentReviewRequests,
  documentGenerationRequests,
}: {
  evidenceFiles: EvidenceFileLite[];
  documentReviewRequests: RequestLite[];
  documentGenerationRequests: RequestLite[];
}) {
  const submitted = evidenceFiles.filter((f) => f.kind === "SUBMITTED");
  const maxVersion = submitted.length > 0 ? Math.max(...submitted.map((f) => f.version)) : 0;
  const aiReviews = evidenceFiles.filter((f) => f.kind === "AI_REVIEW");
  const aiDrafts = evidenceFiles.filter((f) => f.kind === "AI_DRAFT");
  const openReviews = documentReviewRequests.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS");
  const openGenerations = documentGenerationRequests.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS");

  const hasAnything =
    submitted.length > 0 || aiReviews.length > 0 || aiDrafts.length > 0 || openReviews.length > 0 || openGenerations.length > 0;

  if (!hasAnything) {
    return <div className="text-xs italic text-inkmuted">No evidence yet.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      {submitted.map((f) => (
        <div key={f.id} className="font-mono text-xs text-inkmuted">
          {f.version === maxVersion ? (
            <span className="font-bold text-ok">current</span>
          ) : (
            <span className="text-inkmuted">v{f.version}, superseded</span>
          )}{" "}
          {f.fileName} &middot; uploaded {f.uploadedAt.toLocaleDateString("en-GB")}
        </div>
      ))}
      {aiReviews.map((f) => (
        <div key={f.id} className="font-mono text-xs text-inkmuted">
          <span className="rounded-full bg-accentsoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
            AI review
          </span>{" "}
          {f.fileName} &middot; {f.uploadedAt.toLocaleDateString("en-GB")}
        </div>
      ))}
      {aiDrafts.map((f) => (
        <div key={f.id} className="font-mono text-xs text-inkmuted">
          <span className="rounded-full bg-accentsoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
            AI draft
          </span>{" "}
          {f.fileName} &middot; {f.uploadedAt.toLocaleDateString("en-GB")}
        </div>
      ))}
      {openReviews.map((r) => (
        <div key={r.id} className="font-mono text-xs text-inkmuted">
          AI review requested ({r.agentSlug}) &middot; {r.status === "IN_PROGRESS" ? "in progress" : "queued"}
        </div>
      ))}
      {openGenerations.map((r) => (
        <div key={r.id} className="font-mono text-xs text-inkmuted">
          AI draft requested ({r.agentSlug}) &middot; {r.status === "IN_PROGRESS" ? "in progress" : "queued"}
        </div>
      ))}
    </div>
  );
}
