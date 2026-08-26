import {
  CORE_PROJECT_WIDE_TEMPLATES,
  SAFETY_GROUP_TEMPLATES,
  DISCIPLINE_SPECIFIC_TEMPLATES,
  GATE_MAP,
  type DocumentTemplateStatus,
} from "@/lib/documentTemplateRoadmap";

const STATUS_LABEL: Record<DocumentTemplateStatus, string> = {
  live: "Live",
  planned: "Planned",
};
const STATUS_CLASS: Record<DocumentTemplateStatus, string> = {
  live: "bg-ok/15 text-ok",
  planned: "bg-inkmuted/15 text-inkmuted",
};

function StatusBadge({ status }: { status: DocumentTemplateStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Open to every signed-in user (26 Aug 2026) — unlike
 * /regulatory-reference, this isn't admin-only reference material,
 * it's "what auto-generation exists today vs. what's planned" that a
 * PM should be able to check for themselves. Pure static reference
 * content (src/lib/documentTemplateRoadmap.ts) — update a row's
 * `status` there as each one actually ships, this page just renders
 * whatever's there.
 */
export default function DocumentTemplatesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Auto-filled document templates</h1>
      <p className="mb-8 text-sm text-inkmuted">
        For certain deliverables, StageForge can generate a first-draft document — using the brief text, CDM
        works type, discipline, compliance tags and SHTM/HTM references already captured on the project — so
        you don&rsquo;t start from a blank page. You still review, edit, and own the final version before it&rsquo;s
        uploaded as evidence: site-specific detail, risk scoring, and sign-off are always yours to add.
      </p>

      <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">
        1. Core project-wide templates
      </h2>
      <p className="mb-3 text-sm text-inkmuted">Used on almost every project.</p>
      <div className="mb-8 overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Template</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Gate(s)</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Auto-filled content
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">PM still owns</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Status</th>
            </tr>
          </thead>
          <tbody>
            {CORE_PROJECT_WIDE_TEMPLATES.map((row) => (
              <tr key={row.name} className="border-b border-rule last:border-b-0 align-top">
                <td className="px-4 py-3 font-semibold">{row.name}</td>
                <td className="px-4 py-3 text-inkmuted">{row.gates}</td>
                <td className="px-4 py-3 text-inkmuted">{row.autoFilledContent}</td>
                <td className="px-4 py-3 text-inkmuted">{row.pmOwns}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">
        2. Safety Group / compliance submission templates
      </h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Template</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Triggered by system
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Auto-filled content
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">PM still owns</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Status</th>
            </tr>
          </thead>
          <tbody>
            {SAFETY_GROUP_TEMPLATES.map((row) => (
              <tr key={row.name} className="border-b border-rule last:border-b-0 align-top">
                <td className="px-4 py-3 font-semibold">{row.name}</td>
                <td className="px-4 py-3 text-inkmuted">{row.triggeredBy}</td>
                <td className="px-4 py-3 text-inkmuted">{row.autoFilledContent}</td>
                <td className="px-4 py-3 text-inkmuted">{row.pmOwns}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">
        3. Discipline / system-specific templates
      </h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Template</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Related systems
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Auto-filled content
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">PM still owns</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Status</th>
            </tr>
          </thead>
          <tbody>
            {DISCIPLINE_SPECIFIC_TEMPLATES.map((row) => (
              <tr key={row.name} className="border-b border-rule last:border-b-0 align-top">
                <td className="px-4 py-3 font-semibold">{row.name}</td>
                <td className="px-4 py-3 text-inkmuted">{row.relatedSystems}</td>
                <td className="px-4 py-3 text-inkmuted">{row.autoFilledContent}</td>
                <td className="px-4 py-3 text-inkmuted">{row.pmOwns}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">
        4. Template map by RIBA gate
      </h2>
      <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <tbody>
            {GATE_MAP.map((row) => (
              <tr key={row.gate} className="border-b border-rule last:border-b-0 align-top">
                <td className="w-24 px-4 py-3 font-mono text-xs font-bold text-accent">{row.gate}</td>
                <td className="px-4 py-3 text-inkmuted">{row.templates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
