import { RELEASE_NOTES } from "@/lib/whatsNew";

/**
 * Stakeholder-facing release highlights — open to everyone (like
 * lessons-learned), not platform-admin gated, since the audience is
 * FM Contractor and Client Authority stakeholders in this demo, not
 * just the platform admin. Content is hand-written per entry (see
 * lib/whatsNew.ts) rather than generated from PR titles, which are
 * written for the engineering history, not this audience.
 */
export default function WhatsNewPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">What&rsquo;s new</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Highlights from recent updates to StageForge — newest first.
      </p>

      <div className="flex flex-col gap-8">
        {RELEASE_NOTES.map((note) => (
          <div key={note.date} className="rounded-lg border border-rule bg-surface p-5">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">{note.date}</div>
            <h2 className="mb-3 text-base font-semibold">{note.title}</h2>
            <ul className="flex flex-col gap-2">
              {note.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm text-inkmuted">
                  <span className="text-accent">&bull;</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
