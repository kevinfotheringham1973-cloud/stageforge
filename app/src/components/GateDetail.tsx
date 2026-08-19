import { db } from "@/lib/db";
import { getCurrentUserRoleKeysForProject } from "@/lib/session";
import {
  canBypassDeliverable,
  canDecideGate,
  canOverrideCompliance,
  canUploadComplianceEvidence,
  canUploadEvidence,
  isGateReadyForSponsor,
} from "@/lib/permissions";
import {
  approveGate,
  bypassDeliverable,
  overrideCompliance,
  recordComplianceEvidenceStub,
  recordEvidenceStub,
  rejectGate,
  submitForApproval,
} from "@/lib/actions";
import { notFound } from "next/navigation";

/**
 * The full checklist + actions + history for one gate. Used both by
 * the standalone gate route (for a direct link) and inline, expanded
 * in an accordion row on the project overview page.
 */
export async function GateDetail({
  projectNumber,
  gateId,
}: {
  projectNumber: string;
  gateId: string;
}) {
  const gate = await db.gate.findUnique({
    where: { id: gateId },
    include: {
      stage: { include: { project: true } },
      deliverables: {
        orderBy: { createdAt: "asc" },
        include: {
          evidenceFiles: { orderBy: { uploadedAt: "desc" } },
          bypass: { include: { bypassedBy: true } },
        },
      },
      complianceRequirements: {
        orderBy: { createdAt: "asc" },
        include: {
          evidenceFiles: { orderBy: { uploadedAt: "desc" } },
        },
      },
      complianceOverrides: { orderBy: { createdAt: "desc" }, include: { overriddenBy: true } },
      signOffs: { orderBy: { createdAt: "desc" }, include: { signedOffBy: true } },
      auditEntries: { orderBy: { createdAt: "desc" }, include: { actor: true } },
    },
  });
  if (!gate || gate.stage.project.projectNumber !== projectNumber) notFound();

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  const ready = isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements);
  const outstanding = gate.deliverables.filter((d) => d.blocksGate && d.status === "PENDING").length;
  const outstandingCompliance = gate.complianceRequirements.filter(
    (c) => c.blocksGate && c.status === "PENDING"
  ).length;
  const canOverride = canOverrideCompliance(roleKeys);

  return (
    <div>
      {gate.deliverables.length > 0 && (
        <>
          <div className="mb-4 font-mono text-xs font-bold uppercase tracking-wide text-accent">
            Delivery checklist &middot; {gate.deliverables.length - outstanding} of {gate.deliverables.length} clear
          </div>

          <div className="flex flex-col gap-3">
            {gate.deliverables.map((d) => {
              const canBypass = d.status === "PENDING" && canBypassDeliverable(roleKeys, d.bypassAuthority);
              const canReplaceEvidence = gate.status !== "SIGNED_OFF" && canUploadEvidence(roleKeys, d.bypassAuthority);
              const canUpload = d.status === "PENDING" && canReplaceEvidence;

              return (
                <div
                  key={d.id}
                  className={`rounded-lg border bg-surface p-5 ${d.bypassAuthority !== "PM" ? "border-dashed border-flag" : "border-rule"}`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{d.label}</span>
                    {d.bypassAuthority !== "PM" && (
                      <span className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-flag">
                        Requires {d.bypassAuthority.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  {d.description && <p className="mb-2 text-sm text-inkmuted">{d.description}</p>}

                  {d.status === "EVIDENCED" && (
                    <div className="flex flex-col gap-1">
                      {d.evidenceFiles.map((f, i) => (
                        <div key={f.id} className="font-mono text-xs text-inkmuted">
                          {i === 0 ? (
                            <span className="font-bold text-ok">current</span>
                          ) : (
                            <span className="text-inkmuted">v{f.version}, superseded</span>
                          )}{" "}
                          {f.fileName} &middot; uploaded {f.uploadedAt.toLocaleDateString("en-GB")}
                        </div>
                      ))}
                      {canReplaceEvidence && (
                        <form
                          action={recordEvidenceStub.bind(null, d.id, projectNumber, gateId)}
                          className="mt-2 flex items-center gap-2"
                        >
                          <input
                            name="fileName"
                            placeholder="replacement-filename.pdf"
                            required
                            className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                          />
                          <button className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent" type="submit">
                            Replace evidence
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {d.status === "BYPASSED" && d.bypass && (
                    <div className="mt-2 rounded-md border border-dashed border-flag bg-accentsoft/40 p-3 text-sm">
                      <div className="font-mono text-[10px] uppercase tracking-wide text-flag">
                        Bypassed by {d.bypass.bypassedBy.name}
                      </div>
                      <div className="text-inkmuted">{d.bypass.reason}</div>
                    </div>
                  )}

                  {d.status === "PENDING" && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {canUpload ? (
                        <form
                          action={recordEvidenceStub.bind(null, d.id, projectNumber, gateId)}
                          className="flex items-center gap-2"
                        >
                          <input
                            name="fileName"
                            placeholder="filename.pdf"
                            required
                            className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                          />
                          <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white" type="submit">
                            Upload evidence
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-inkmuted">Outstanding &mdash; no evidence uploaded.</span>
                      )}

                      {canBypass && (
                        <form
                          action={bypassDeliverable.bind(null, d.id, projectNumber, gateId)}
                          className="flex items-center gap-2"
                        >
                          <input
                            name="reason"
                            placeholder="Reason for bypass (required)"
                            required
                            className="w-64 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                          />
                          <button className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag" type="submit">
                            Bypass
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {gate.complianceRequirements.length > 0 && (
        <>
          <div className="mb-4 mt-6 font-mono text-xs font-bold uppercase tracking-wide text-accent">
            Compliance &middot; {gate.complianceRequirements.length - outstandingCompliance} of{" "}
            {gate.complianceRequirements.length} clear
          </div>

          <div className="flex flex-col gap-3">
            {gate.complianceRequirements.map((c) => {
              const canUpload = c.status === "PENDING" && canUploadComplianceEvidence(roleKeys);
              const canReplaceEvidence = gate.status !== "SIGNED_OFF" && canUploadComplianceEvidence(roleKeys);
              const coveringOverride = gate.complianceOverrides.find((o) =>
                o.coveredRequirementIds.includes(c.id)
              );

              return (
                <div key={c.id} className="rounded-lg border border-dashed border-flag bg-surface p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.label}</span>
                    <span className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-flag">
                      Compliance
                    </span>
                  </div>
                  {c.description && <p className="mb-1 text-sm text-inkmuted">{c.description}</p>}
                  {c.ruleRef && <p className="mb-2 font-mono text-xs text-inkmuted">{c.ruleRef}</p>}

                  {c.status === "EVIDENCED" && (
                    <div className="flex flex-col gap-1">
                      {c.evidenceFiles.map((f, i) => (
                        <div key={f.id} className="font-mono text-xs text-inkmuted">
                          {i === 0 ? (
                            <span className="font-bold text-ok">current</span>
                          ) : (
                            <span className="text-inkmuted">v{f.version}, superseded</span>
                          )}{" "}
                          {f.fileName} &middot; uploaded {f.uploadedAt.toLocaleDateString("en-GB")}
                        </div>
                      ))}
                      {canReplaceEvidence && (
                        <form
                          action={recordComplianceEvidenceStub.bind(null, c.id, projectNumber, gateId)}
                          className="mt-2 flex items-center gap-2"
                        >
                          <input
                            name="fileName"
                            placeholder="replacement-filename.pdf"
                            required
                            className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                          />
                          <button className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent" type="submit">
                            Replace evidence
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {c.status === "OVERRIDDEN" && coveringOverride && (
                    <div className="mt-2 rounded-md border border-dashed border-flag bg-accentsoft/40 p-3 text-sm">
                      <div className="font-mono text-[10px] uppercase tracking-wide text-flag">
                        Overridden by {coveringOverride.overriddenBy.name}
                      </div>
                      <div className="text-inkmuted">{coveringOverride.reason}</div>
                    </div>
                  )}

                  {c.status === "PENDING" && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {canUpload ? (
                        <form
                          action={recordComplianceEvidenceStub.bind(null, c.id, projectNumber, gateId)}
                          className="flex items-center gap-2"
                        >
                          <input
                            name="fileName"
                            placeholder="filename.pdf"
                            required
                            className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                          />
                          <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white" type="submit">
                            Upload evidence
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-inkmuted">Outstanding &mdash; no evidence uploaded.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {outstandingCompliance > 0 && canOverride && (
            <div className="mt-3 rounded-lg border border-dashed border-flag bg-accentsoft/30 p-4">
              <div className="mb-2 text-sm text-inkmuted">
                {outstandingCompliance} compliance requirement(s) still outstanding on this gate — an SRO
                override clears every outstanding one at once, not item by item.
              </div>
              <form action={overrideCompliance.bind(null, gateId, projectNumber)} className="flex items-center gap-2">
                <input
                  name="reason"
                  placeholder="Reason for overriding all outstanding compliance requirements (required)"
                  required
                  className="w-96 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                />
                <button className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag" type="submit">
                  Override all outstanding
                </button>
              </form>
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex items-center justify-between rounded-lg border border-rule bg-surface px-6 py-5">
        {gate.status === "NOT_STARTED" && (
          <span className="text-sm text-inkmuted">
            This gate hasn&rsquo;t started &mdash; work through the earlier gates first.
          </span>
        )}

        {gate.status === "IN_PROGRESS" && (
          <>
            <span className="text-sm text-inkmuted">
              {ready
                ? "Every deliverable and compliance requirement is clear — ready to submit."
                : [
                    outstanding > 0 ? `${outstanding} delivery item(s)` : null,
                    outstandingCompliance > 0 ? `${outstandingCompliance} compliance item(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(" and ") + " outstanding."}
            </span>
            {roleKeys.includes("PM") ? (
              <form action={submitForApproval.bind(null, gateId, projectNumber)}>
                <button
                  disabled={!ready}
                  className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-inkmuted"
                  type="submit"
                >
                  Submit for Sponsor approval
                </button>
              </form>
            ) : (
              <span className="text-xs text-inkmuted">Only the PM can submit this gate.</span>
            )}
          </>
        )}

        {gate.status === "AWAITING_SPONSOR" &&
          (canDecideGate(roleKeys) ? (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="text-sm text-inkmuted">Awaiting your decision as Sponsor.</span>
              <div className="flex items-center gap-3">
                <form action={approveGate.bind(null, gateId, projectNumber)}>
                  <button className="rounded-md bg-ok px-4 py-2.5 text-sm font-bold text-white" type="submit">
                    Approve gate
                  </button>
                </form>
                <form action={rejectGate.bind(null, gateId, projectNumber)} className="flex items-center gap-2">
                  <input
                    name="reason"
                    placeholder="Reason for rejection (required)"
                    required
                    className="w-64 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                  />
                  <button className="rounded-md border border-risk px-4 py-2.5 text-sm font-semibold text-risk" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <span className="text-sm text-inkmuted">Submitted &mdash; awaiting the Sponsor&rsquo;s decision.</span>
          ))}

        {gate.status === "SIGNED_OFF" && (
          <span className="text-sm font-semibold text-ok">
            Signed off by {gate.signOffs.find((s) => s.decision === "APPROVED")?.signedOffBy.name}
          </span>
        )}
      </div>

      {gate.signOffs.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-inkmuted">Decision history</div>
          <div className="flex flex-col gap-2">
            {gate.signOffs.map((s) => (
              <div key={s.id} className="rounded-md border border-rule bg-surface px-4 py-2.5 text-sm">
                <span className={s.decision === "APPROVED" ? "font-semibold text-ok" : "font-semibold text-risk"}>
                  {s.decision === "APPROVED" ? "Approved" : "Rejected"}
                </span>{" "}
                by {s.signedOffBy.name} &middot; {s.createdAt.toLocaleDateString("en-GB")}
                {s.reason && <div className="mt-1 text-inkmuted">{s.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {gate.auditEntries.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-inkmuted">
            Activity log &middot; append-only
          </div>
          <div className="flex flex-col gap-1.5">
            {gate.auditEntries.map((a) => (
              <div key={a.id} className="rounded-md border border-rule bg-surface px-4 py-2 text-xs">
                <span className="font-mono font-semibold text-accent">{a.action}</span>{" "}
                <span className="text-inkmuted">
                  by {a.actor.name} &middot; {a.createdAt.toLocaleString("en-GB")}
                </span>
                {a.reason && <div className="mt-1 text-inkmuted">&ldquo;{a.reason}&rdquo;</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
