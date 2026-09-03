/**
 * Deliberate stub (1 Sep 2026, sidebar redesign) -- no user guide
 * exists yet. Says so honestly rather than linking to content that
 * isn't there.
 */
export default function DocumentationPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Documentation</h1>
      <p className="text-sm text-inkmuted">
        A full user guide is still being written. For the compliance side, see{" "}
        <a href="/regulatory-reference" className="font-semibold text-accent hover:underline">
          Regulatory reference
        </a>{" "}
        and{" "}
        <a href="/document-templates" className="font-semibold text-accent hover:underline">
          Document templates
        </a>
        ; for day-to-day use, ask your PM or project team.
      </p>
    </div>
  );
}
