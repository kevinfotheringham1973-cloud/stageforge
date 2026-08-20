import { db } from "@/lib/db";

/**
 * Portfolio-wide lessons-learned library — the point of recording a
 * lesson at all (GateDetail's form) rather than just noting it in a
 * project's own history. Grouped by Gate.key rather than by project:
 * every Template reuses the same RIBA stage/gate keys (ConfigSchema.html
 * §06 decided flag), so "what went wrong at Spatial Coordination" reads
 * across the whole portfolio regardless of which template a project
 * came from. Read-only — lessons are recorded from the gate itself.
 */
export default async function LessonsLearnedPage() {
  const lessons = await db.lessonLearned.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      recordedBy: true,
      gate: { include: { stage: { include: { project: true } } } },
    },
  });

  const byGateKey = new Map<
    string,
    { gateName: string; entries: typeof lessons }
  >();
  for (const lesson of lessons) {
    const key = lesson.gate.key;
    const group = byGateKey.get(key) ?? { gateName: lesson.gate.name, entries: [] };
    group.entries.push(lesson);
    byGateKey.set(key, group);
  }
  const groups = Array.from(byGateKey.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Lessons learned</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Every lesson recorded on any gate, across every project — grouped by gate/stage so patterns
        at the same point in the lifecycle (e.g. every Spatial Coordination gate) are visible
        regardless of which project or template they came from.
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-inkmuted">
          No lessons recorded yet — add one from any gate&rsquo;s detail page.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([key, group]) => (
            <div key={key}>
              <div className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">
                {group.gateName} &middot; {group.entries.length}
              </div>
              <div className="flex flex-col gap-3">
                {group.entries.map((l) => (
                  <div key={l.id} className="rounded-lg border border-rule bg-surface p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${
                          l.type === "WENT_WELL" ? "bg-accentsoft text-ok" : "bg-accentsoft text-warn"
                        }`}
                      >
                        {l.type === "WENT_WELL" ? "Went well" : "To improve"}
                      </span>
                      <span className="font-mono text-xs text-inkmuted">
                        {l.gate.stage.project.name} (#{l.gate.stage.project.projectNumber})
                      </span>
                    </div>
                    <p className="text-sm">{l.text}</p>
                    <div className="mt-1.5 text-xs text-inkmuted">
                      {l.recordedBy.name} &middot; {l.createdAt.toLocaleDateString("en-GB")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
