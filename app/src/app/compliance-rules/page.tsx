import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { updateComplianceRuleApprovals } from "@/lib/actions";
import { BYPASS_AUTHORITY_LABEL } from "@/lib/permissions";
import { SubmitButton } from "@/components/SubmitButton";
import { notFound } from "next/navigation";

/**
 * Platform-admin-only. Configures each ComplianceRuleTemplate's
 * approval setup — who can override it (overrideAuthority) and which
 * other role(s) must also independently co-sign
 * (additionalApproverRoleKeys, see the multi-party approval feature
 * in GateDetail.tsx/permissions.ts#isComplianceRequirementClear).
 * Deliberately narrow: everything else about a rule (which stages it
 * applies to, tags, evidence type) still has no editor — see
 * app/README.md's "Template authoring UI" stub note.
 */
export default async function ComplianceRulesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isPlatformAdmin) notFound();

  const [ruleSets, roles] = await Promise.all([
    db.complianceRuleSet.findMany({
      orderBy: { name: "asc" },
      include: { rules: { orderBy: { label: "asc" } } },
    }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Compliance rule approvals</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Who can override each rule, and which additional role(s) must independently sign off before it&rsquo;s
        truly clear. Platform admin only. Everything else about a rule (which stages it applies to, evidence
        type) still isn&rsquo;t editable here.
      </p>

      <div className="flex flex-col gap-8">
        {ruleSets.map((ruleSet) => (
          <div key={ruleSet.id}>
            <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">{ruleSet.name}</h2>
            <div className="flex flex-col gap-3">
              {ruleSet.rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-rule bg-surface p-5">
                  <div className="mb-1 font-semibold">{rule.label}</div>
                  {rule.description && <p className="mb-1 text-sm text-inkmuted">{rule.description}</p>}
                  {rule.ruleRef && <p className="mb-3 font-mono text-xs text-inkmuted">{rule.ruleRef}</p>}

                  <form action={updateComplianceRuleApprovals.bind(null, rule.id)} className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                        Override authority
                      </label>
                      <select
                        name="overrideAuthority"
                        defaultValue={rule.overrideAuthority}
                        className="w-64 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
                      >
                        {Object.entries(BYPASS_AUTHORITY_LABEL).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                        Additional sign-off required from
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {roles.map((role) => (
                          <label key={role.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              name="additionalApproverRoleKeys"
                              value={role.key}
                              defaultChecked={rule.additionalApproverRoleKeys.includes(role.key)}
                            />
                            {role.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-1.5 text-xs text-inkmuted">
                      <input type="checkbox" name="applyToExisting" />
                      Also apply to already-live projects (not just future ones)
                    </label>

                    <div>
                      <SubmitButton pendingText="Saving…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                        Save
                      </SubmitButton>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
