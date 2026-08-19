import { db } from "@/lib/db";
import { getCurrentUserRoleKeysForProject } from "@/lib/session";
import {
  canApproveSpend,
  canBypassDeliverable,
  canDecideGate,
  canOverrideCompliance,
  canRecordLessonLearned,
  canRecordSpend,
  canSetGateTimeline,
  canUploadComplianceEvidence,
  canUploadEvidence,
  GATE_TIMELINE_BAR_CLASS,
  GATE_TIMELINE_LABELS,
  gateTimelineStatus,
  isGateReadyForSponsor,
} from "@/lib/permissions";
import {
  approveGate,
  approveSpend,
  bypassDeliverable,
  overrideCompliance,
  recordComplianceEvidenceStub,
  recordEvidenceStub,
  recordLessonLearned,
  recordSpend,
  rejectGate,
  rejectSpend,
  setGateTimeline,
  submitForApproval,
} from "@/lib/actions";
import { notFound } from "next/navigation";

const APPROVAL_BUCKET_LABELS: Record<string, string> = {
  LIFECYCLE_REPLACEMENT: "Lifecycle replacement",
  SMALL_WORKS: "Small works",
  VARIATION: "Variation",
};

function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

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
      spendRecords: {
        orderBy: { createdAt: "asc" },
        include: {
          recordedBy: true,
          approvals: { orderBy: { createdAt: "desc" }, include: { approvedBy: true } },
        },
      },
      signOffs: { orderBy: { createdAt: "desc" }, include: { signedOffBy: true } },
      auditEntries: { orderBy: { createdAt: "desc" }, include: { actor: true } },
      lessonsLearned: { orderBy: { createdAt: "desc" }, include: { recordedBy: true } },
    },
  });
  if (!gate || gate.stage.project.projectNumber !== projectNumber) notFound();

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  const ready = isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements, gate.spendRecords);
  const outstanding = gate.deliverables.filter((d) => d.blocksGate && d.status === "PENDING").length;
  const outstandingCompliance = gate.complianceRequirements.filter(
    (c) => c.blocksGate && c.status === "PENDING"
  ).length;
  const outstandingSpend = gate.spendRecords.filter((s) => s.blocksGate && s.status === "PENDING").length;
  const canOverride = canOverrideCompliance(roleKeys);
  const canRecord = canRecordSpend(roleKeys);
  const canApprove = canApproveSpend(roleKeys);
  const canSetTimeline = canSetGateTimeline(roleKeys);
  const canRecordLesson = canRecordLessonLearned(roleKeys);
  const timelineStatus = gateTimelineStatus(gate);

  return (
    <div>
      <div className="mb-6 rounded-lg border border-rule bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Timeline</div>
          <span
            className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-white ${GATE_TIMELINE_BAR_CLASS[timelineStatus]}`}
          >
            {GATE_TIMELINE_LABELS[timelineStatus]}
          </span>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Target start</div>
            <div>{gate.targetStartDate ? gate.targetStartDate.toLocaleDateString("en-GB") : "Not set"}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Target end</div>
            <div>{gate.targetEndDate ? gate.targetEndDate.toLocaleDateString("en-GB") : "Not set"}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Actual start</div>
            <div className={gate.actualStartDate ? "" : "text-inkmuted"}>
              {gate.actualStartDate ? gate.actualStartDate.toLocaleDateString("en-GB") : "—"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Actual end</div>
            <div className={gate.actualEndDate ? "" : "text-inkmuted"}>
              {gate.actualEndDate ? gate.actualEndDate.toLocaleDateString("en-GB") : "—"}
            </div>
          </div>
        </div>

        {canSetTimeline && (
          <form
            action={setGateTimeline.bind(null, gateId, projectNumber)}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-rule pt-4"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Target start
              </label>
              <input
                type="date"
                name="targetStartDate"
                defaultValue={toDateInputValue(gate.targetStartDate)}
                className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Target end
              </label>
              <input
                type="date"
                name="targetEndDate"
                defaultValue={toDateInputValue(gate.targetEndDate)}
                className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
              />
            </div>
            <button type="submit" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
              Set dates
            </button>
          </form>
        )}
      </div>

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
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            name="reason"
                            placeholder="Reason for bypass (required)"
                            required
                            className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm sm:w-64"
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
              <form action={overrideCompliance.bind(null, gateId, projectNumber)} className="flex flex-wrap items-center gap-2">
                <input
                  name="reason"
                  placeholder="Reason for overriding all outstanding compliance requirements (required)"
                  required
                  className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm sm:w-96"
                />
                <button className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag" type="submit">
                  Override all outstanding
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {(gate.spendRecords.length > 0 || canRecord) && (
        <>
          <div className="mb-4 mt-6 font-mono text-xs font-bold uppercase tracking-wide text-accent">
            Spend &middot; {gate.spendRecords.length - outstandingSpend} of {gate.spendRecords.length} approved
          </div>

          <div className="flex flex-col gap-3">
            {gate.spendRecords.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg border bg-surface p-5 ${s.status === "PENDING" ? "border-warn" : "border-rule"}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    &pound;{Number(s.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent">
                    {APPROVAL_BUCKET_LABELS[s.bucket] ?? s.bucket}
                  </span>
                  {s.status === "APPROVED" ? (
                    <span className="rounded bg-ok px-2 py-0.5 text-xs font-bold text-white">Approved</span>
                  ) : (
                    <span className="rounded bg-warn px-2 py-0.5 text-xs font-bold text-white">Pending approval</span>
                  )}
                </div>
                <p className="mb-1 text-sm text-inkmuted">{s.description}</p>
                <div className="font-mono text-xs text-inkmuted">
                  {s.invoiceReference && <>Invoice {s.invoiceReference} &middot; </>}
                  recorded by {s.recordedBy.name} &middot; {s.createdAt.toLocaleDateString("en-GB")}
                </div>

                {s.approvals.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {s.approvals.map((a) => (
                      <div key={a.id} className="rounded-md border border-dashed border-flag bg-accentsoft/40 p-3 text-sm">
                        <div className="font-mono text-[10px] uppercase tracking-wide text-flag">
                          {a.decision === "APPROVED" ? "Approved" : "Rejected"} by {a.approvedBy.name}
                        </div>
                        {a.reason && <div className="text-inkmuted">{a.reason}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {s.status === "PENDING" && canApprove && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <form action={approveSpend.bind(null, s.id, projectNumber, gateId)}>
                      <button className="rounded-md bg-ok px-3 py-1.5 text-sm font-semibold text-white" type="submit">
                        Approve spend
                      </button>
                    </form>
                    <form action={rejectSpend.bind(null, s.id, projectNumber, gateId)} className="flex flex-wrap items-center gap-2">
                      <input
                        name="reason"
                        placeholder="Reason for rejection (required)"
                        required
                        className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm sm:w-64"
                      />
                      <button className="rounded-md border border-risk px-3 py-1.5 text-sm font-semibold text-risk" type="submit">
                        Reject
                      </button>
                    </form>
                  </div>
                )}
                {s.status === "PENDING" && !canApprove && (
                  <span className="mt-2 block text-xs text-inkmuted">Awaiting Sponsor/SRO approval.</span>
                )}
              </div>
            ))}
          </div>

          {canRecord && (
            <form
              action={recordSpend.bind(null, gateId, projectNumber)}
              className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-rule bg-surface p-4"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Bucket
                  </label>
                  <select name="bucket" className="rounded border border-rule bg-bg px-2.5 py-1.5 text-sm">
                    <option value="LIFECYCLE_REPLACEMENT">Lifecycle replacement</option>
                    <option value="SMALL_WORKS">Small works</option>
                    <option value="VARIATION">Variation</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Amount (&pound;)
                  </label>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="w-32 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Invoice ref
                  </label>
                  <input name="invoiceReference" className="w-32 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                  Description
                </label>
                <input name="description" required className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm" />
              </div>
              <button
                type="submit"
                className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent"
              >
                Record spend
              </button>
            </form>
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
                ? "Every deliverable, compliance requirement, and spend record is clear — ready to submit."
                : [
                    outstanding > 0 ? `${outstanding} delivery item(s)` : null,
                    outstandingCompliance > 0 ? `${outstandingCompliance} compliance item(s)` : null,
                    outstandingSpend > 0 ? `${outstandingSpend} spend record(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(", ") + " outstanding."}
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
            <div className="flex w-full flex-wrap items-center justify-between gap-4">
              <span className="text-sm text-inkmuted">Awaiting your decision as Sponsor.</span>
              <div className="flex flex-wrap items-center gap-3">
                <form action={approveGate.bind(null, gateId, projectNumber)}>
                  <button className="rounded-md bg-ok px-4 py-2.5 text-sm font-bold text-white" type="submit">
                    Approve gate
                  </button>
                </form>
                <form action={rejectGate.bind(null, gateId, projectNumber)} className="flex flex-wrap items-center gap-2">
                  <input
                    name="reason"
                    placeholder="Reason for rejection (required)"
                    required
                    className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm sm:w-64"
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

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-wide text-inkmuted">
            Lessons learned{gate.lessonsLearned.length > 0 && <> &middot; {gate.lessonsLearned.length} recorded</>}
          </div>
          <span className="text-xs text-inkmuted">Shared across every project on this gate type &rarr; /lessons-learned</span>
        </div>

        {gate.lessonsLearned.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {gate.lessonsLearned.map((l) => (
              <div key={l.id} className="rounded-md border border-rule bg-surface px-4 py-2.5 text-sm">
                <span
                  className={`mr-2 rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${
                    l.type === "WENT_WELL" ? "bg-accentsoft text-ok" : "bg-accentsoft text-warn"
                  }`}
                >
                  {l.type === "WENT_WELL" ? "Went well" : "To improve"}
                </span>
                {l.text}
                <div className="mt-1 text-xs text-inkmuted">
                  {l.recordedBy.name} &middot; {l.createdAt.toLocaleDateString("en-GB")}
                </div>
              </div>
            ))}
          </div>
        )}

        {canRecordLesson && (
          <form
            action={recordLessonLearned.bind(null, gateId, projectNumber)}
            className="flex flex-col gap-2 rounded-lg border border-dashed border-rule bg-surface p-4"
          >
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="type" value="WENT_WELL" defaultChecked required /> Went well
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="type" value="TO_IMPROVE" required /> To improve
              </label>
            </div>
            <textarea
              name="text"
              required
              rows={2}
              placeholder="What happened, and what should the next project like this do differently (or repeat)?"
              className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent"
            >
              Add lesson
            </button>
          </form>
        )}
      </div>

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
