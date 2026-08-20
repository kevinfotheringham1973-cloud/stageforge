import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { GateDetail } from "@/components/GateDetail";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  AWAITING_SPONSOR: "Awaiting Sponsor",
  SIGNED_OFF: "Signed off",
};

const STATUS_CLASS: Record<string, string> = {
  NOT_STARTED: "bg-surface2 text-inkmuted",
  IN_PROGRESS: "bg-accent text-white",
  AWAITING_SPONSOR: "bg-accent text-white",
  SIGNED_OFF: "bg-accentsoft text-ok",
};

/**
 * One gate, selected from the dashboard's side rail — the panel that
 * swaps in place of the old accordion-expand. Navigation, not client
 * state: bookmarkable/shareable per gate, and only this gate's full
 * detail (deliverables/compliance/spend/timeline) is fetched, via
 * GateDetail's own query.
 */
export default async function GateDetailPage({
  params,
}: {
  params: Promise<{ projectNumber: string; gateId: string }>;
}) {
  const { projectNumber, gateId } = await params;

  const gate = await db.gate.findUnique({
    where: { id: gateId },
    include: { stage: { include: { project: true } } },
  });
  if (!gate || gate.stage.project.projectNumber !== projectNumber) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{gate.name}</h2>
        <span
          className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${STATUS_CLASS[gate.status]}`}
        >
          {STATUS_LABEL[gate.status]}
        </span>
      </div>
      <GateDetail projectNumber={projectNumber} gateId={gateId} />
    </div>
  );
}
