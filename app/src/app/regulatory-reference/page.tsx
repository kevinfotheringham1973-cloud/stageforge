import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { forbidden } from "next/navigation";
import { REGULATION_CONVERSION_ROWS, REGULATION_CONVERSION_NOTES } from "@/lib/regulationConversion";
import { ENGLAND_SECTOR_VARIANT_KEY } from "@/lib/englandConversion";

const EFFORT_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "Higher" };
const EFFORT_CLASS: Record<string, string> = {
  low: "bg-ok/15 text-ok",
  medium: "bg-warn/15 text-warn",
  high: "bg-danger/15 text-danger",
};

/**
 * Platform-admin-only. The table below is still the static reference
 * (Regulation Conversion_England_Scotland.docx, 24 Aug 2026) — but the
 * conversion it describes is no longer just notes: src/lib/
 * englandConversion.ts actually generates a second, "health_england"
 * SectorVariant (22 Templates + 17 compliance rules, SHTM->HTM
 * converted) from the live Scotland corpus, re-runnable any time that
 * corpus changes with `npm run england:generate`. The banner below
 * confirms it actually exists in this DB right now. Its Templates carry
 * empty matchKeywords deliberately (same trick the retired Cold Water
 * Storage template uses) — listMatchableTemplates only offers templates
 * with matchKeywords set, so this stays invisible in the current
 * single-tenant (Scotland) demo's project-creation dropdown until a
 * real England tenant is onboarded and someone deliberately populates
 * them.
 */
export default async function RegulatoryReferencePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isPlatformAdmin) forbidden();

  const allTemplateKeys = REGULATION_CONVERSION_ROWS.flatMap((r) => r.templateKeys);
  const templates = await db.template.findMany({
    where: { key: { in: allTemplateKeys } },
    select: { key: true, name: true },
  });
  const templateNameByKey = new Map(templates.map((t) => [t.key, t.name]));

  const englandVariant = await db.sectorVariant.findUnique({
    where: { key: ENGLAND_SECTOR_VARIANT_KEY },
    include: { _count: { select: { templates: true, complianceRuleSets: true } } },
  });
  const englandRuleCount = englandVariant
    ? await db.complianceRuleTemplate.count({ where: { ruleSet: { sectorVariantId: englandVariant.id } } })
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Scotland → England regulatory reference</h1>
      <p className="mb-4 text-sm text-inkmuted">
        This deployment&rsquo;s templates are built against Scottish guidance (SHTM, Building (Scotland) Act 2003,
        HAI-SCRIBE). This is the conversion reference for what each of the 18 checklists needed to change to stand
        up an England-jurisdiction tenant (HTM, Building Regulations 2010, local IPC processes).
      </p>

      {englandVariant ? (
        <div className="mb-8 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm">
          <span className="font-semibold text-ok">Generated and live in this database:</span>{" "}
          {englandVariant._count.templates} converted templates and {englandRuleCount} compliance rules under the
          &ldquo;{englandVariant.name}&rdquo; SectorVariant. Not yet selectable in this demo&rsquo;s project-creation
          dropdown — its templates carry empty matchKeywords until a real England tenant needs them. Re-run{" "}
          <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-xs">npm run england:generate</code> any
          time the Scotland corpus changes to refresh it.
        </div>
      ) : (
        <div className="mb-8 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          Not yet generated in this database — run{" "}
          <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-xs">npm run england:generate</code>.
        </div>
      )}

      <div className="mb-8 overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">System</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Scotland (primary guidance)
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                England (equivalent guidance)
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Notes on difference
              </th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Effort</th>
            </tr>
          </thead>
          <tbody>
            {REGULATION_CONVERSION_ROWS.map((row) => (
              <tr key={row.system} className="border-b border-rule last:border-b-0 align-top">
                <td className="px-4 py-3 font-semibold">
                  {row.system}
                  {row.templateKeys.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.templateKeys.map((k) => (
                        <span
                          key={k}
                          className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[10px] text-inkmuted"
                        >
                          {templateNameByKey.get(k) ?? k}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-inkmuted">{row.scotland}</td>
                <td className="px-4 py-3 text-inkmuted">{row.england}</td>
                <td className="px-4 py-3 text-inkmuted">{row.notes}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${EFFORT_CLASS[row.effort]}`}
                  >
                    {EFFORT_LABEL[row.effort]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">Key conversion notes</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Item</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Scotland</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">England</th>
              <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Action required
              </th>
            </tr>
          </thead>
          <tbody>
            {REGULATION_CONVERSION_NOTES.map((n) => (
              <tr key={n.item} className="border-b border-rule last:border-b-0 align-top">
                <td className="px-4 py-3 font-semibold">{n.item}</td>
                <td className="px-4 py-3 text-inkmuted">{n.scotland}</td>
                <td className="px-4 py-3 text-inkmuted">{n.england}</td>
                <td className="px-4 py-3 text-inkmuted">{n.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-rule p-5 text-sm text-inkmuted">
        <p className="mb-1.5">
          <span className="font-semibold text-ink">Low effort</span> (simple document reference swap): systems 1–4,
          6–12, 15, 17
        </p>
        <p className="mb-1.5">
          <span className="font-semibold text-ink">Medium effort</span> (Firecode + minor adjustments): fire
          detection &amp; alarm, fire suppression
        </p>
        <p className="mb-1.5">
          <span className="font-semibold text-ink">Higher effort</span>: ward/theatre refurbishment, because of
          HAI-SCRIBE
        </p>
        <p>
          Overall: the 18 checklists can be converted for use in England with relatively modest editing. The RIBA
          structure, deliverables lists, and most technical content remain valid.
        </p>
      </div>
    </div>
  );
}
