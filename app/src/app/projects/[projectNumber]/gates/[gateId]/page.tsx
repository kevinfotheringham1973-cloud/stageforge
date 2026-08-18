import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { GateDetail } from "@/components/GateDetail";

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
    <div className="mx-auto max-w-3xl px-10 py-10">
      <Link href={`/projects/${projectNumber}`} className="mb-6 inline-block text-sm font-semibold text-accent">
        &larr; {gate.stage.project.name}
      </Link>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{gate.name}</h1>
          <div className="font-mono text-xs uppercase tracking-wide text-inkmuted">
            Stage: {gate.stage.name}
          </div>
        </div>
        <span className="rounded-full bg-surface2 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-inkmuted">
          {gate.status.replace(/_/g, " ")}
        </span>
      </div>

      <GateDetail projectNumber={projectNumber} gateId={gateId} />
    </div>
  );
}
