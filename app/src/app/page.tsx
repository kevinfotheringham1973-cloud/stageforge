import Link from "next/link";
import { db } from "@/lib/db";

export default async function HomePage() {
  const projects = await db.project.findMany({ orderBy: { projectNumber: "asc" } });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold">Projects</h1>
      <p className="mb-8 text-inkmuted">
        Phase 1 scaffold — one seeded project. Switch acting user in the header to see how
        permissions change what you can do on a gate.
      </p>
      <div className="flex flex-col gap-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.projectNumber}`}
            className="rounded-lg border border-rule bg-surface px-6 py-5 hover:border-accent"
          >
            <div className="text-lg font-bold">{p.name}</div>
            <div className="font-mono text-xs uppercase tracking-wide text-inkmuted">
              Project No. {p.projectNumber}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
