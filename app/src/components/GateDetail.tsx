import { db } from "@/lib/db";
import { getCurrentUserGlobalRoleKeys, getCurrentUserRoleKeysForProject } from "@/lib/session";
import { evidenceFolderPath } from "@/lib/sharepoint";
import { SubmitButton } from "@/components/SubmitButton";
import {
  canApproveSpend,
  canBypassDeliverable,
  canCoSignCompliance,
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
  isComplianceRequirementClear,
  isGateReadyForSponsor,
} from "@/lib/permissions";
import {
  approveGate,
  approveSpend,
  bypassDeliverable,
  deleteSpendRecord,
  overrideCompliance,
  recordComplianceCoSignOff,
  recordComplianceEvidenceStub,
  recordEvidenceStub,
  recordLessonLearned,
  recordSpend,
  rejectGate,
  rejectSpend,
  reviseSpend,
  setGateTimeline,
  submitForApproval,
  uploadSpendInvoice,
} from "@/lib/actions";
import { notFound } from "next/navigation";

const APPROVAL_BUCKET_LABELS: Record<string, string> = {
  LIFECYCLE_REPLACEMENT: "Lifecycle replacement",
  SMALL_WORKS: "Small works",
  VARIATION: "Variation",
};

// Matched by key suffix, not an enumerated list (26 Aug 2026) — an
// earlier enumerated Set (#89) missed BMS entirely: its live
// DeliverableTemplate/Deliverable rows still carry the pre-#82
// del.bms_pre_construction_information key, even though seed.ts's
// *current* text says BMS should use the shared
// del.common_pre_construction_information (the canonicalization never
// got backfilled onto BMS's already-instantiated data). A suffix match
// recognises every discipline's PCI item regardless of prefix, so it
// self-heals against this whole class of drift instead of needing a
// hand-maintained list kept in sync with seed.ts.
function isPciDeliverable(key: string): boolean {
  return key.endsWith("_pre_construction_information");
}

function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * currentFileRef is the most recent evidence file's fileRef — a real
 * https:// SharePoint webUrl once resolveEvidenceUpload actually
 * uploaded it (actions.ts), or the local://dev-upload stub otherwise.
 * That one string is enough to tell which state we're in — no need to
 * separately check env vars here.
 */
function SharePointEvidenceLocation({
  project,
  stageName,
  currentFileRef,
}: {
  project: { name: string; projectNumber: string };
  stageName: string;
  currentFileRef: string;
}) {
  const isSynced = currentFileRef.startsWith("https://");
  const folderIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 text-accent" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3.19a1.5 1.5 0 0 1 1.06.44l1.06 1.06H12.5A1.5 1.5 0 0 1 14 5v7.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-9Z"
      />
    </svg>
  );

  if (isSynced) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-inkmuted">
        {folderIcon}
        <a href={currentFileRef} target="_blank" rel="noopener noreferrer" className="font-mono text-accent underline">
          Open in SharePoint
        </a>
        <span className="rounded bg-ok/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ok">
          Synced to SharePoint
        </span>
      </div>
    );
  }

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-inkmuted"
      title="Upload is wired up and ready — evidence will land here as soon as a SharePoint site is connected."
    >
      {folderIcon}
      <span className="font-mono">/{evidenceFolderPath(project, stageName)}/</span>
      <span className="rounded bg-accentsoft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
        Preview &middot; SharePoint endpoint needs connected
      </span>
    </div>
  );
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
      stage: {
        include: {
          project: {
            include: { template: true, additionalTemplates: { include: { template: true } } },
          },
        },
      },
      deliverables: {
        orderBy: { createdAt: "asc" },
        include: {
          evidenceFiles: { orderBy: { uploadedAt: "desc" } },
          bypass: { include: { bypassedBy: true } },
          template: { select: { order: true, gateTemplate: { select: { stageTemplate: { select: { templateId: true } } } } } },
        },
      },
      complianceRequirements: {
        orderBy: { createdAt: "asc" },
        include: {
          evidenceFiles: { orderBy: { uploadedAt: "desc" } },
          coSignOffs: { include: { signedOffBy: true } },
        },
      },
      complianceOverrides: { orderBy: { createdAt: "desc" }, include: { overriddenBy: true } },
      spendRecords: {
        orderBy: { createdAt: "asc" },
        include: {
          recordedBy: true,
          approvals: { orderBy: { createdAt: "desc" }, include: { approvedBy: true } },
          invoiceFiles: { orderBy: { uploadedAt: "desc" } },
        },
      },
      signOffs: { orderBy: { createdAt: "desc" }, include: { signedOffBy: true } },
      auditEntries: { orderBy: { createdAt: "desc" }, include: { actor: true } },
      lessonsLearned: { orderBy: { createdAt: "desc" }, include: { recordedBy: true } },
    },
  });
  if (!gate || gate.stage.project.projectNumber !== projectNumber) notFound();

  const [roleKeys, globalRoleKeys, allRoles] = await Promise.all([
    getCurrentUserRoleKeysForProject(gate.stage.projectId),
    getCurrentUserGlobalRoleKeys(),
    db.role.findMany(),
  ]);
  // Real lookups, not guesses — bypassAuthority/overrideAuthority are
  // open Role.key strings now (23 Aug 2026, "fully dynamic authority
  // roles"), so both the display name and "does SRO inherit into this"
  // come from the current Role rows, not a fixed enum/list.
  const roleLabelByKey = Object.fromEntries(allRoles.map((r) => [r.key, r.name]));
  const exactMatchAuthorityKeys = new Set(allRoles.filter((r) => r.isExactMatchAuthority).map((r) => r.key));

  // Shared-slot deliverable display for a merged project (26 Aug 2026,
  // superseding the "Common + one section per Template" grouping —
  // Kevin's own follow-up feedback on #30033 was that section-grouping
  // alone still reads as too many boxes). Every Template's own gates
  // follow a highly consistent positional pattern (Concept options ->
  // Outline strategy -> Preliminary design at Gate 2, etc., confirmed
  // by auditing every template's labels gate-by-gate) — DeliverableTemplate.order
  // records each item's position within its own Template's gate, so a
  // merged project's items sharing a position collapse into ONE shared
  // box instead of one card per discipline. A del.common_* item
  // (already deduped to one row by instantiateStage) just needs no
  // special handling here — it's simply a group of size 1, like any
  // unmatched item. A solo-template project (still the common case)
  // renders exactly as before — no grouping, no visual change.
  const constituentTemplates = [
    gate.stage.project.template,
    ...gate.stage.project.additionalTemplates.map((a) => a.template),
  ];
  const isMerged = constituentTemplates.length > 1;
  const primaryTemplateId = gate.stage.project.template.id;

  // Which system(s) a deliverable actually belongs to (26 Aug 2026,
  // "make decisions on using the BYPASS clearer") — only meaningful on
  // a merged project, since a solo-template project's own deliverables
  // are trivially "that one system" already. Canonicalizing near-
  // duplicate items across templates onto one shared key (Fire
  // Compartmentation, Method Statements, etc.) means a single
  // Deliverable row can now legitimately represent 2+ disciplines at
  // once, and its own templateId only ever points at whichever
  // template instantiateStage saw first — so this is derived fresh
  // from each constituent template's OWN DeliverableTemplate list for
  // this exact stage, not read off the live row.
  const keyToTemplateNames = new Map<string, string[]>();
  if (isMerged) {
    const templateNameById = new Map(constituentTemplates.map((t) => [t.id, t.name]));
    const stageTemplatesForThisGate = await db.stageTemplate.findMany({
      where: { templateId: { in: constituentTemplates.map((t) => t.id) }, key: gate.stage.key },
      include: { gateTemplate: { include: { deliverableTemplates: { select: { key: true } } } } },
    });
    for (const st of stageTemplatesForThisGate) {
      const templateName = templateNameById.get(st.templateId);
      if (!templateName || !st.gateTemplate) continue;
      for (const dt of st.gateTemplate.deliverableTemplates) {
        if (!keyToTemplateNames.has(dt.key)) keyToTemplateNames.set(dt.key, []);
        keyToTemplateNames.get(dt.key)!.push(templateName);
      }
    }
  }

  let fallbackGroupKey = 0;
  // Position-fallback matching only holds up within one "shape" of
  // template (26 Aug 2026, found live on #30036 — Ventilation +
  // Ward Refresh's Gate 4-7 arrays don't line up at all past a handful
  // of anchored items: "BMS installation testing" fell into the same
  // slot as "Temporary arrangements and clinical continuity records"
  // purely because both happened to be array position 6 in their own
  // template). The 3 room/space-refresh templates (Ward Refresh, MHU,
  // Theatre Refresh — see SPACE_REFRESH_TEMPLATE_KEYS in
  // riskRegisterDraft.ts for the same category split) follow a
  // fundamentally different Gate-by-Gate shape than the 18 plant/
  // system-replacement templates, so position alone is never a safe
  // signal across that boundary — only an explicit keyword anchor is.
  // Folding category into the position fallback's own key (rather than
  // only gating anchors) means two plant templates, or two
  // space-refresh templates, still position-match each other exactly
  // as confirmed working before; only a plant<->space-refresh position
  // "collision" now falls apart into two solo cards instead of a wrong
  // shared box.
  const SPACE_REFRESH_TEMPLATE_KEYS = new Set([
    "template.health.room_ward_refresh",
    "template.health.mhu_ligature_room_refresh",
    "template.health.theatre_refresh",
  ]);
  const templateCategoryById = new Map(
    constituentTemplates.map((t) => [t.id, SPACE_REFRESH_TEMPLATE_KEYS.has(t.key) ? "space_refresh" : "plant"])
  );
  // The Pre-Contract Hold Point block was originally excluded from
  // slot-matching (26 Aug 2026) on the reasoning that each discipline
  // might be procured separately, so a merged project genuinely needed
  // one commercial hold point per discipline. Reversed the same day,
  // per Kevin's review of #30033 in practice: seeing "Obtain minimum of
  // two competitive quotations" (and the rest of the block) appear
  // twice reads as exactly the duplication this feature exists to fix
  // — one contractor/procurement exercise typically covers a merged
  // project's whole scope. Now matched via the keyword anchors below
  // like everything else; only del.common_* (already deduped to one
  // row by instantiateStage) still needs the "never match" treatment.
  // Raw position alone drifts as soon as one template's gate has an
  // extra/inserted item the other doesn't (26 Aug 2026, caught on
  // #30033's Gate 1: Nurse Call's "Clinical needs assessment" — which
  // Ward Refresh has no equivalent of — sits between the two
  // templates' otherwise-matching items, shifting every position after
  // it by one and cross-wiring Ward's "Initial risk register" with
  // Nurse Call's needs-assessment item instead of Nurse Call's own risk
  // register). These anchors are recognisable generic phrasing shared
  // across most/all templates at a given gate (confirmed by auditing
  // every template's labels gate-by-gate) and take priority over
  // position when a label matches one — position is still the fallback
  // for gate 4-6's more discipline-specific content, where no safe
  // generic anchor exists. Each was validated against every template's
  // actual labels to confirm it never matches two items within the same
  // template's own gate (which would wrongly merge that template's own
  // distinct items together).
  const KEYWORD_ANCHORS: RegExp[] = [
    /^business case/i,
    /^strategic brief/i,
    /^project brief/i,
    /condition survey/i,
    /risk register/i,
    /^concept (design options|options\b|design report)/i,
    /^coordinated design/i,
    /^spatial coordination/i,
    /fire compartmentation/i,
    /^updated cost plan, risk register/i,
    /^soft landings/i,
    /post-occupancy/i,
    /^updated (maintenance|operational|water safety|ventilation management|written scheme)/i,
    /^ongoing (maintenance|monitoring|thorough examination|planned)/i,
    /material.{0,20}certificates/i,
    /^full (technical design|commissioning|inspection)/i,
    /^design risk assessment/i,
    /^contractor'?s?( method| detailed)? method statements/i,
    /^as-fitted|^as-built/i,
    /o&m manuals/i,
    /^formal (client|clinical|acceptance)|acceptance$/i,
    // Pre-Contract Hold Point block (26 Aug 2026 — see note above) and
    // a handful of near-duplicate items that were never byte-identical
    // enough to canonicalize in #82 (e.g. Ward Refresh's "Building
    // Standards..." vs the canonical "Building Regulations...", or its
    // own worded "Pre-construction information & input to Construction
    // Phase Plan" vs the canonical "Pre-Construction Information
    // (CDM)") — caught on #30033's Gate 4 still showing these as
    // separate cards after the earlier fixes.
    /^updated cost plan including appropriate contingency/i,
    // The three separate quotations/submission/PPM items were merged
    // into one across every template (26 Aug 2026, "these are all the
    // same action") — one anchor now, not three.
    /^obtain and submit competitive quotations/i,
    /^pre-contract hold point/i,
    /^after appointment: complete full technical drawings/i,
    /building (regulations|standards).{0,5}statutory compliance/i,
    /^pre-construction information/i,
    /^tender documentation/i,
    // Ventilation + Ward Refresh's Gate 4 arrays don't line up
    // positionally at all past this point (found via a real merged
    // project, #30036, showing "BMS / controls philosophy" boxed
    // together with "HAI-SCRIBE Stage 2 design review" — not even one
    // word in common) — position-matching's fallback was pairing
    // unrelated items purely by array index. Each of these anchors
    // either correctly groups the same real action across templates
    // (fire strategy/means of escape; the MEP interface-design item;
    // HAI-SCRIBE's two distinct infection-control items, kept as two
    // separate anchors rather than one so they never conflate design
    // review with construction-phase measures) or, where a concept is
    // genuinely unique to one template (filter/hygiene strategy), just
    // takes it out of position-matching's blast radius entirely.
    /filter.{0,20}hygiene/i,
    /^bms.{0,10}(controls?|control philosophy)/i,
    /^electrical design associated with/i,
    /^fire strategy and means of escape/i,
    /^interface design with/i,
    /^hai-scribe stage 2 design review/i,
    /^dust, water and infection control measures during construction/i,
  ];
  const keywordAnchorIndex = (label: string): number | null => {
    const index = KEYWORD_ANCHORS.findIndex((pattern) => pattern.test(label));
    return index === -1 ? null : index;
  };
  // Too generic to trust across the plant/space-refresh category
  // boundary above — "Outline ventilation strategy" (a plant
  // template's own airflow/filtration design strategy) and "Outline
  // clinical environment strategy" (Ward Refresh's finishes/infection-
  // control strategy) both matched a single loose /^outline .*strategy/
  // anchor and got boxed together despite sharing nothing but the
  // opening word (found live on #30036, alongside "Preliminary
  // schematics and load assessment" boxing with "Preliminary room data
  // sheets / layouts" the same way). Both patterns are still exactly
  // right *within* one category — two plant templates' own "Outline X
  // strategy" items, or two space-refresh templates' own "Preliminary"
  // items, really are the same kind of action — so this doesn't drop
  // them, it just folds category into their key the same way the order
  // fallback above does, instead of matching blind across the boundary.
  const CATEGORY_SENSITIVE_ANCHORS: RegExp[] = [/^outline .*strategy/i, /^preliminary/i];
  const categorySensitiveAnchorIndex = (label: string): number | null => {
    const index = CATEGORY_SENSITIVE_ANCHORS.findIndex((pattern) => pattern.test(label));
    return index === -1 ? null : index;
  };
  const slotGroups = isMerged
    ? Array.from(
        gate.deliverables
          .reduce((groups, d) => {
            // A keyword anchor match always wins, even for a
            // del.common_* item — e.g. the canonical "Pre-Construction
            // Information (CDM)" still needs to box together with Ward
            // Refresh's own non-canonical "Pre-construction information
            // & input to Construction Phase Plan" (never byte-identical
            // enough for #82's canonicalization, but the same real
            // deliverable). Only a del.common_* item with NO anchor
            // match falls back to forced-solo, never `order` — it
            // inherits whichever template "won" instantiateStage's
            // dedup, an order value that can coincidentally collide
            // with an unrelated item at that same position in another
            // template's own numbering.
            const anchorIndex = keywordAnchorIndex(d.label);
            const categoryOf = (deliverable: typeof d) => {
              const owningTemplateId = deliverable.template?.gateTemplate.stageTemplate.templateId;
              return owningTemplateId ? templateCategoryById.get(owningTemplateId) ?? "plant" : "plant";
            };
            let slotKey: string;
            if (anchorIndex !== null) {
              slotKey = `anchor:${anchorIndex}`;
            } else if (d.key.startsWith("del.common_")) {
              slotKey = `solo:${fallbackGroupKey++}`;
            } else if (categorySensitiveAnchorIndex(d.label) !== null) {
              slotKey = `catanchor:${categoryOf(d)}:${categorySensitiveAnchorIndex(d.label)}`;
            } else if (d.template) {
              slotKey = `order:${categoryOf(d)}:${d.template.order}`;
            } else {
              slotKey = `solo:${fallbackGroupKey++}`;
            }
            const order = d.template?.order ?? Infinity;
            if (!groups.has(slotKey)) groups.set(slotKey, { order, deliverables: [] });
            else groups.get(slotKey)!.order = Math.min(groups.get(slotKey)!.order, order);
            groups.get(slotKey)!.deliverables.push(d);
            return groups;
          }, new Map<string, { order: number; deliverables: typeof gate.deliverables }>())
          .values()
      ).sort((a, b) => a.order - b.order)
    : [];
  const ready = isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements, gate.spendRecords);
  const outstanding = gate.deliverables.filter((d) => d.blocksGate && d.status === "PENDING").length;
  // "Outstanding" means not yet truly gate-clear — PENDING, or already
  // EVIDENCED/OVERRIDDEN but still waiting on a required additional
  // approver's co-sign (see isComplianceRequirementClear).
  const outstandingComplianceItems = gate.complianceRequirements.filter(
    (c) => c.blocksGate && !isComplianceRequirementClear(c)
  );
  const outstandingCompliance = outstandingComplianceItems.length;
  const outstandingSpend = gate.spendRecords.filter((s) => s.blocksGate && s.status === "PENDING").length;
  // Bulk "override all outstanding" only acts on items with no
  // decision recorded yet — a PENDING subset of the above, since
  // override can't do anything for an item that's already
  // EVIDENCED/OVERRIDDEN and just waiting on a co-sign.
  const pendingComplianceItems = gate.complianceRequirements.filter((c) => c.blocksGate && c.status === "PENDING");
  // Bulk "override all outstanding" only makes sense when the actor
  // holds authority for every distinct authority among them — see the
  // matching check in actions.ts#overrideCompliance.
  const canOverride =
    pendingComplianceItems.length > 0 &&
    Array.from(new Set(pendingComplianceItems.map((c) => c.overrideAuthority))).every((auth) =>
      canOverrideCompliance(roleKeys, exactMatchAuthorityKeys, auth)
    );
  const canRecord = canRecordSpend(roleKeys);
  const canApprove = canApproveSpend(roleKeys);
  const canSetTimeline = canSetGateTimeline(roleKeys);
  const canRecordLesson = canRecordLessonLearned(roleKeys);
  const timelineStatus = gateTimelineStatus(gate);

  // Extracted so the grouped (merged-project) and flat (solo-project)
  // render paths below share one identical card, no logic duplicated.
  // Split into "body" (label/badge + description + status content +
  // controls) and the full bordered card, so a shared slot box (below)
  // can reuse the exact same body content without nesting a second
  // border inside its own — and, for the box's primary item, without
  // repeating the label a second time (the box's own header already is
  // that item's label).
  // Shared between the label row below and the shared-box header
  // (which renders its own <h4> outside renderDeliverableBody entirely,
  // so this can't just live inline in one place).
  const systemBadge = (d: (typeof gate.deliverables)[number]) =>
    isMerged && keyToTemplateNames.has(d.key) ? (
      <span
        className="rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide bg-inkmuted/15 text-inkmuted"
        title="Which system(s) this deliverable covers"
      >
        {keyToTemplateNames.get(d.key)!.join(" + ")}
      </span>
    ) : null;

  const renderDeliverableBody = (d: (typeof gate.deliverables)[number], showLabel = true) => {
    const canBypass =
      d.status === "PENDING" &&
      canBypassDeliverable(roleKeys, d.bypassAuthority, exactMatchAuthorityKeys, globalRoleKeys);
    const canReplaceEvidence =
      gate.status !== "SIGNED_OFF" &&
      canUploadEvidence(roleKeys, d.bypassAuthority, exactMatchAuthorityKeys, globalRoleKeys);
    const canUpload = d.status === "PENDING" && canReplaceEvidence;

    // Statutory ceiling gets a visibly heavier treatment than a routine
    // Compliance-Officer-level item — an SRO-, Fire-Officer-, or
    // Authorised-Person-only requirement should never read the same
    // as a document a PM can wave through themselves.
    const isHeavyAuthority = d.bypassAuthority === "SRO" || exactMatchAuthorityKeys.has(d.bypassAuthority);

    return (
      <>
        {showLabel && (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{d.label}</span>
            {systemBadge(d)}
            {d.bypassAuthority !== "PM" && (
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                  isHeavyAuthority ? "bg-risk text-white" : "bg-accentsoft text-flag"
                }`}
              >
                Requires {roleLabelByKey[d.bypassAuthority] ?? d.bypassAuthority}
              </span>
            )}
          </div>
        )}
        {d.description && <p className="mb-2 text-sm text-inkmuted">{d.description}</p>}

        {isPciDeliverable(d.key) && canReplaceEvidence && (
          <a
            href={`/api/projects/${projectNumber}/pci-draft`}
            className="mb-3 flex items-center gap-2 rounded-md border-2 border-accent bg-accentsoft px-3 py-2 text-sm font-bold text-accent hover:bg-accent hover:text-white"
          >
            <span aria-hidden="true">⬇</span>
            <span>
              Generate PCI draft (.docx)
              <span className="block text-xs font-normal">Pre-filled from this project&rsquo;s own data — review and edit before uploading</span>
            </span>
          </a>
        )}

        {d.key.endsWith("_expanded_risk_register") && canReplaceEvidence && (
          <a
            href={`/api/projects/${projectNumber}/risk-register-draft`}
            className="mb-3 flex items-center gap-2 rounded-md border-2 border-accent bg-accentsoft px-3 py-2 text-sm font-bold text-accent hover:bg-accent hover:text-white"
          >
            <span aria-hidden="true">⬇</span>
            <span>
              Generate Risk Register draft (.xlsx)
              <span className="block text-xs font-normal">Standard risks pre-filled — score, assign and complete before uploading</span>
            </span>
          </a>
        )}

        {d.status === "EVIDENCED" && (
          <div className="flex flex-col gap-1">
            {(() => {
              // Grouped by version, not index (26 Aug 2026, "multiple
              // file inputs") — a merged deliverable's evidence batch
              // is however many files were uploaded in ONE submission,
              // all sharing that submission's version number, so every
              // file in the latest version is "current" together, not
              // just the first one.
              const maxVersion = Math.max(...d.evidenceFiles.map((f) => f.version));
              return d.evidenceFiles.map((f) => (
                <div key={f.id} className="font-mono text-xs text-inkmuted">
                  {f.version === maxVersion ? (
                    <span className="font-bold text-ok">current</span>
                  ) : (
                    <span className="text-inkmuted">v{f.version}, superseded</span>
                  )}{" "}
                  {f.fileName} &middot; uploaded {f.uploadedAt.toLocaleDateString("en-GB")}
                </div>
              ));
            })()}
            <SharePointEvidenceLocation
              project={gate.stage.project}
              stageName={gate.stage.name}
              currentFileRef={d.evidenceFiles[0]?.fileRef ?? ""}
            />
            {canReplaceEvidence && (
              <form
                action={recordEvidenceStub.bind(null, d.id, projectNumber, gateId)}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  type="file"
                  name="file"
                  multiple
                  aria-label={`Replacement evidence file(s) for ${d.label}`}
                  required
                  className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accentsoft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent"
                />
                <SubmitButton pendingText="Uploading…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
                  Replace evidence
                </SubmitButton>
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
                  type="file"
                  name="file"
                  multiple
                  aria-label={`Evidence file(s) for ${d.label}`}
                  required
                  className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accentsoft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent"
                />
                <SubmitButton pendingText="Uploading…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                  Upload evidence
                </SubmitButton>
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
                  aria-label={`Reason for bypassing ${d.label}`}
                  placeholder="Reason for bypass (required)"
                  required
                  className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm sm:w-64"
                />
                <SubmitButton pendingText="Bypassing…" className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag">
                  Bypass
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </>
    );
  };

  const renderDeliverable = (d: (typeof gate.deliverables)[number]) => {
    const isHeavyAuthority = d.bypassAuthority === "SRO" || exactMatchAuthorityKeys.has(d.bypassAuthority);
    const cardClass = isHeavyAuthority
      ? "border-2 border-risk bg-risk/5"
      : d.bypassAuthority === "COMPLIANCE_OFFICER"
        ? "border-dashed border-flag bg-surface"
        : "border-rule bg-surface";
    return (
      <div key={d.id} className={`rounded-lg border p-5 ${cardClass}`}>
        {renderDeliverableBody(d)}
      </div>
    );
  };

  return (
    <div>
      <details className="group mb-6 rounded-lg border border-rule bg-surface px-4 py-3">
        <summary className="cursor-pointer select-none font-mono text-[10px] font-bold uppercase tracking-wide text-inkmuted">
          What do Upload, Bypass, Override &amp; Reject mean?
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <div>
            <span className="font-semibold">Upload evidence</span> — the normal path. Attach the actual
            document or certificate that proves a delivery item or compliance requirement is met.
          </div>
          <div>
            <span className="font-semibold">Bypass</span> (delivery items only) — skip a delivery item
            with no evidence, when it genuinely doesn&rsquo;t apply to this project. Ordinary items (no
            badge) need PM authority — held by any PM, not just this specific project&rsquo;s. An item
            carrying a badge (e.g. &ldquo;Requires Fire Officer&rdquo;) needs that specific role on this
            project, no exceptions. Either way, the reason is recorded permanently against your name.
          </div>
          <div>
            <span className="font-semibold">Override</span> (compliance items only) — the same idea as
            Bypass, but for legal/compliance requirements, and one override clears every outstanding
            compliance item on the gate at once rather than one at a time. Needs the specific authority
            named on the item — an SRO cannot override a Fire Officer&ndash; or Authorised Person&ndash;only
            requirement.
          </div>
          <div>
            <span className="font-semibold">Reject</span> (Sponsor only) — sends the whole gate back to
            the PM once it&rsquo;s been submitted, because something about it isn&rsquo;t right. This is
            different from Bypass/Override: it stops the entire gate, not just one item.
          </div>
        </div>
      </details>

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
              <label htmlFor="target-start-date" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Target start
              </label>
              <input
                id="target-start-date"
                type="date"
                name="targetStartDate"
                defaultValue={toDateInputValue(gate.targetStartDate)}
                className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="target-end-date" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Target end
              </label>
              <input
                id="target-end-date"
                type="date"
                name="targetEndDate"
                defaultValue={toDateInputValue(gate.targetEndDate)}
                className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
              />
            </div>
            <SubmitButton pendingText="Setting…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
              Set dates
            </SubmitButton>
          </form>
        )}
        {!canSetTimeline && (
          <p className="mt-3 border-t border-rule pt-3 text-xs text-inkmuted">
            Only the PM sets target dates on this project.
          </p>
        )}
      </div>

      {(gate.deliverables.length > 0 ||
        gate.complianceRequirements.length > 0 ||
        gate.spendRecords.length > 0 ||
        canRecord) && (
        <div className="sticky top-0 z-10 mb-6 -mx-1 flex flex-wrap gap-4 border-b border-rule bg-bg px-1 py-2 font-mono text-xs font-semibold uppercase tracking-wide">
          {gate.deliverables.length > 0 && (
            <a href="#deliverables" className="text-accent hover:underline">
              Deliverables {outstanding > 0 && <span className="text-warn">({outstanding})</span>}
            </a>
          )}
          {gate.complianceRequirements.length > 0 && (
            <a href="#compliance" className="text-accent hover:underline">
              Compliance {outstandingCompliance > 0 && <span className="text-flag">({outstandingCompliance})</span>}
            </a>
          )}
          {(gate.spendRecords.length > 0 || canRecord) && (
            <a href="#spend" className="text-accent hover:underline">
              Spend {outstandingSpend > 0 && <span className="text-warn">({outstandingSpend})</span>}
            </a>
          )}
          <a href="#lessons-learned" className="text-accent hover:underline">
            Lessons learned
          </a>
        </div>
      )}

      {gate.deliverables.length > 0 && (
        <>
          <h3 id="deliverables" className="mb-4 scroll-mt-16 font-mono text-xs font-bold uppercase tracking-wide text-accent">
            Delivery checklist &middot; {gate.deliverables.length - outstanding} of {gate.deliverables.length} clear
          </h3>

          {isMerged ? (
            <div className="flex flex-col gap-3">
              {slotGroups.map((group) => {
                if (group.deliverables.length === 1) {
                  return renderDeliverable(group.deliverables[0]!);
                }
                // Shared slot box: header is the primary template's own
                // item at this position (falls back to the first item
                // in the group if the primary has nothing here) — its
                // own controls sit right under the header with no
                // restated label; every other contributing template's
                // item gets its own labelled sub-row below.
                const primaryIndex = group.deliverables.findIndex(
                  (d) => d.template?.gateTemplate?.stageTemplate.templateId === primaryTemplateId
                );
                const primary = group.deliverables[primaryIndex === -1 ? 0 : primaryIndex]!;
                const others = group.deliverables.filter((d) => d.id !== primary.id);
                return (
                  <div key={primary.id} className="rounded-lg border border-rule bg-surface p-5">
                    <h4 className="mb-1 flex flex-wrap items-center gap-2 font-semibold">
                      <span>{primary.label}</span>
                      {systemBadge(primary)}
                    </h4>
                    {renderDeliverableBody(primary, false)}
                    <div className="mt-3 flex flex-col divide-y divide-rule">
                      {others.map((d) => (
                        <div key={d.id} className="pt-3 first:pt-0">
                          {renderDeliverableBody(d)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">{gate.deliverables.map(renderDeliverable)}</div>
          )}
        </>
      )}

      {gate.complianceRequirements.length > 0 && (
        <>
          <h3 id="compliance" className="mb-4 mt-6 scroll-mt-16 font-mono text-xs font-bold uppercase tracking-wide text-accent">
            Compliance &middot; {gate.complianceRequirements.length - outstandingCompliance} of{" "}
            {gate.complianceRequirements.length} clear
          </h3>

          <div className="flex flex-col gap-3">
            {gate.complianceRequirements.map((c) => {
              const canUpload = c.status === "PENDING" && canUploadComplianceEvidence(roleKeys);
              const canReplaceEvidence = gate.status !== "SIGNED_OFF" && canUploadComplianceEvidence(roleKeys);
              const coveringOverride = gate.complianceOverrides.find((o) =>
                o.coveredRequirementIds.includes(c.id)
              );

              const isExactMatchOverride = exactMatchAuthorityKeys.has(c.overrideAuthority);
              const cardClass = isExactMatchOverride ? "border-2 border-risk bg-risk/5" : "border-dashed border-flag bg-surface";

              return (
                <div key={c.id} className={`rounded-lg border p-5 ${cardClass}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.label}</span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                        isExactMatchOverride ? "bg-risk text-white" : "bg-accentsoft text-flag"
                      }`}
                    >
                      {isExactMatchOverride ? `Requires ${roleLabelByKey[c.overrideAuthority] ?? c.overrideAuthority}` : "Compliance"}
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
                      <SharePointEvidenceLocation
                        project={gate.stage.project}
                        stageName={gate.stage.name}
                        currentFileRef={c.evidenceFiles[0]?.fileRef ?? ""}
                      />
                      {canReplaceEvidence && (
                        <form
                          action={recordComplianceEvidenceStub.bind(null, c.id, projectNumber, gateId)}
                          className="mt-2 flex items-center gap-2"
                        >
                          <input
                            type="file"
                            name="file"
                            aria-label={`Replacement evidence file for ${c.label}`}
                            required
                            className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accentsoft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent"
                          />
                          <SubmitButton pendingText="Uploading…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
                            Replace evidence
                          </SubmitButton>
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

                  {(c.status === "EVIDENCED" || c.status === "OVERRIDDEN") &&
                    c.additionalApproverRoleKeys.length > 0 && (
                      <div className="mt-2 rounded-md border border-dashed border-accent bg-accent/5 p-3 text-sm">
                        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                          Additional sign-off required
                        </div>
                        <div className="flex flex-col gap-2">
                          {c.additionalApproverRoleKeys.map((roleKey) => {
                            const signOff = c.coSignOffs.find((s) => s.roleKey === roleKey);
                            const roleLabel = roleLabelByKey[roleKey] ?? roleKey;
                            if (signOff) {
                              return (
                                <div key={roleKey} className="font-mono text-xs text-ok">
                                  ✓ {roleLabel} — signed off by {signOff.signedOffBy.name} &middot;{" "}
                                  {signOff.createdAt.toLocaleDateString("en-GB")}
                                </div>
                              );
                            }
                            if (canCoSignCompliance(roleKeys, roleKey)) {
                              return (
                                <form
                                  key={roleKey}
                                  action={recordComplianceCoSignOff.bind(null, c.id, projectNumber, gateId, roleKey)}
                                  className="flex items-center gap-2"
                                >
                                  <SubmitButton pendingText="Signing off…" className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                                    Sign off as {roleLabel}
                                  </SubmitButton>
                                </form>
                              );
                            }
                            return (
                              <div key={roleKey} className="font-mono text-xs text-inkmuted">
                                {roleLabel} — awaiting sign-off
                              </div>
                            );
                          })}
                        </div>
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
                            type="file"
                            name="file"
                            aria-label={`Evidence file for ${c.label}`}
                            required
                            className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accentsoft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent"
                          />
                          <SubmitButton pendingText="Uploading…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                            Upload evidence
                          </SubmitButton>
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

          {pendingComplianceItems.length > 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-flag bg-accentsoft/30 p-4">
              <div className="mb-2 text-sm text-inkmuted">
                {pendingComplianceItems.length} compliance requirement(s) still outstanding on this gate — one
                override clears all of them at once, not item by item. Requires{" "}
                {Array.from(new Set(pendingComplianceItems.map((c) => c.overrideAuthority)))
                  .map((a) => roleLabelByKey[a] ?? a)
                  .join(" and ")}{" "}
                authority.
              </div>
              {canOverride ? (
                <form action={overrideCompliance.bind(null, gateId, projectNumber)} className="flex flex-wrap items-center gap-2">
                  <input
                    name="reason"
                    aria-label="Reason for overriding all outstanding compliance requirements"
                    placeholder="Reason for overriding all outstanding compliance requirements (required)"
                    required
                    className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm sm:w-96"
                  />
                  <SubmitButton pendingText="Overriding…" className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag">
                    Override all outstanding
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-xs text-inkmuted">
                  You don&rsquo;t hold that authority, so you can&rsquo;t use this — evidence each item
                  individually above instead, or ask someone with the right authority to override.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {(gate.spendRecords.length > 0 || canRecord) && (
        <>
          <h3 id="spend" className="mb-4 mt-6 scroll-mt-16 font-mono text-xs font-bold uppercase tracking-wide text-accent">
            Spend &middot; {gate.spendRecords.length - outstandingSpend} of {gate.spendRecords.length} approved
          </h3>

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
                  <span className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
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

                <div className="mt-2 flex flex-col gap-1">
                  {s.invoiceFiles.map((f) => (
                    <div key={f.id} className="font-mono text-xs text-inkmuted">
                      <span className="font-bold text-ok">invoice</span> {f.fileName} &middot; uploaded{" "}
                      {f.uploadedAt.toLocaleDateString("en-GB")}
                    </div>
                  ))}
                  {s.invoiceFiles.length === 0 && (
                    <div className="font-mono text-xs text-warn">No invoice document attached yet.</div>
                  )}
                  {s.status === "PENDING" && canRecord && (
                    <form
                      action={uploadSpendInvoice.bind(null, s.id, projectNumber, gateId)}
                      className="mt-1 flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="file"
                        name="file"
                        aria-label={`Invoice document for the £${Number(s.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })} spend record`}
                        required
                        className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accentsoft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent"
                      />
                      <SubmitButton pendingText="Uploading…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
                        Attach invoice
                      </SubmitButton>
                    </form>
                  )}
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
                    {s.invoiceFiles.length > 0 ? (
                      <form action={approveSpend.bind(null, s.id, projectNumber, gateId)}>
                        <SubmitButton pendingText="Approving…" className="rounded-md bg-ok px-3 py-1.5 text-sm font-semibold text-white">
                          Approve spend
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-inkmuted">Waiting on the PM to attach an invoice before this can be approved.</span>
                    )}
                    <form action={rejectSpend.bind(null, s.id, projectNumber, gateId)} className="flex flex-wrap items-center gap-2">
                      <input
                        name="reason"
                        aria-label={`Reason for rejecting the £${Number(s.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })} spend record`}
                        placeholder="Reason for rejection (required)"
                        required
                        className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm sm:w-64"
                      />
                      <SubmitButton pendingText="Rejecting…" className="rounded-md border border-risk px-3 py-1.5 text-sm font-semibold text-risk">
                        Reject
                      </SubmitButton>
                    </form>
                  </div>
                )}
                {s.status === "PENDING" && !canApprove && (
                  <span className="mt-2 block text-xs text-inkmuted">Awaiting Finance/SRO approval.</span>
                )}

                {s.status === "PENDING" && canRecord && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-accent">
                      Revise
                    </summary>
                    <form
                      action={reviseSpend.bind(null, s.id, projectNumber, gateId)}
                      className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-rule bg-bg p-3"
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label
                            htmlFor={`revise-bucket-${s.id}`}
                            className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted"
                          >
                            Bucket
                          </label>
                          <select
                            id={`revise-bucket-${s.id}`}
                            name="bucket"
                            defaultValue={s.bucket}
                            className="rounded border border-inkmuted bg-surface px-2.5 py-1.5 text-sm"
                          >
                            <option value="LIFECYCLE_REPLACEMENT">Lifecycle replacement</option>
                            <option value="SMALL_WORKS">Small works</option>
                            <option value="VARIATION">Variation</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor={`revise-amount-${s.id}`}
                            className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted"
                          >
                            Amount (&pound;)
                          </label>
                          <input
                            id={`revise-amount-${s.id}`}
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            defaultValue={Number(s.amount)}
                            className="w-32 rounded border border-inkmuted bg-surface px-2.5 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`revise-invoice-ref-${s.id}`}
                            className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted"
                          >
                            Invoice ref
                          </label>
                          <input
                            id={`revise-invoice-ref-${s.id}`}
                            name="invoiceReference"
                            defaultValue={s.invoiceReference ?? ""}
                            className="w-32 rounded border border-inkmuted bg-surface px-2.5 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor={`revise-description-${s.id}`}
                          className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted"
                        >
                          Description
                        </label>
                        <input
                          id={`revise-description-${s.id}`}
                          name="description"
                          required
                          defaultValue={s.description}
                          className="w-full rounded border border-inkmuted bg-surface px-2.5 py-1.5 text-sm"
                        />
                      </div>
                      <SubmitButton
                        pendingText="Saving…"
                        className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent"
                      >
                        Save revision
                      </SubmitButton>
                    </form>
                  </details>
                )}

                {s.status === "PENDING" && canRecord && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-risk">
                      Delete
                    </summary>
                    <form
                      action={deleteSpendRecord.bind(null, s.id, projectNumber, gateId)}
                      className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-risk bg-bg p-3"
                    >
                      <input
                        name="reason"
                        aria-label={`Reason for deleting the £${Number(s.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })} spend record`}
                        placeholder="Reason for deleting (required)"
                        required
                        className="w-full rounded border border-inkmuted bg-surface px-2.5 py-1.5 text-sm sm:w-64"
                      />
                      <SubmitButton pendingText="Deleting…" className="rounded-md border border-risk px-3 py-1.5 text-sm font-semibold text-risk">
                        Delete permanently
                      </SubmitButton>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>

          {canRecord && (
            <form
              action={recordSpend.bind(null, gateId, projectNumber)}
              className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-rule bg-surface p-4"
            >
              <p className="text-xs text-inkmuted">
                <span className="font-semibold">Bucket</span> just categorises the spend for reporting —
                it doesn&rsquo;t change who approves it. <span className="font-semibold">Lifecycle replacement</span>:
                routine like-for-like swap at end of working life (most projects). <span className="font-semibold">Small
                works</span>: minor, lower-value work. <span className="font-semibold">Variation</span>: a change to
                what was originally agreed. Not sure which? Ask your Compliance Officer. Once it&rsquo;s recorded,
                attach the actual invoice document below it — Finance can&rsquo;t approve without one.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="spend-bucket" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Bucket
                  </label>
                  <select id="spend-bucket" name="bucket" className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm">
                    <option value="LIFECYCLE_REPLACEMENT">Lifecycle replacement</option>
                    <option value="SMALL_WORKS">Small works</option>
                    <option value="VARIATION">Variation</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="spend-amount" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Amount (&pound;)
                  </label>
                  <input
                    id="spend-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="w-32 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="spend-invoice-ref" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Invoice ref
                  </label>
                  <input id="spend-invoice-ref" name="invoiceReference" className="w-32 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="spend-description" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                  Description
                </label>
                <input id="spend-description" name="description" required className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm" />
              </div>
              <SubmitButton pendingText="Recording…" className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
                Record spend
              </SubmitButton>
            </form>
          )}
          {!canRecord && gate.spendRecords.length > 0 && (
            <p className="mt-3 text-xs text-inkmuted">Only a PM or SRO can record new spend on this gate.</p>
          )}
        </>
      )}

      <div className="mt-6 flex items-center justify-between rounded-lg border border-rule bg-surface px-6 py-5">
        {gate.status === "NOT_STARTED" && (
          <span className="text-sm text-inkmuted">
            {gate.stage.order === 0
              ? "Not started yet — upload evidence, record spend, or add compliance documents below to begin."
              : "This gate hasn’t started — work through the earlier gates first."}
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
                <SubmitButton
                  disabled={!ready}
                  pendingText="Submitting…"
                  className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:bg-surface2 disabled:text-inkmuted"
                >
                  Submit for Sponsor approval
                </SubmitButton>
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
                  <SubmitButton pendingText="Approving…" className="rounded-md bg-ok px-4 py-2.5 text-sm font-bold text-white">
                    Approve gate
                  </SubmitButton>
                </form>
                <form action={rejectGate.bind(null, gateId, projectNumber)} className="flex flex-wrap items-center gap-2">
                  <input
                    name="reason"
                    aria-label="Reason for rejecting this gate"
                    placeholder="Reason for rejection (required)"
                    required
                    className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm sm:w-64"
                  />
                  <SubmitButton pendingText="Rejecting…" className="rounded-md border border-risk px-4 py-2.5 text-sm font-semibold text-risk">
                    Reject
                  </SubmitButton>
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

      <div id="lessons-learned" className="mt-6 scroll-mt-16">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-inkmuted">
            Lessons learned{gate.lessonsLearned.length > 0 && <> &middot; {gate.lessonsLearned.length} recorded</>}
          </h3>
          <span className="text-xs text-inkmuted">Shared across every project on this gate type &rarr; /lessons-learned</span>
        </div>

        {gate.lessonsLearned.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {gate.lessonsLearned.map((l) => (
              <div key={l.id} className="rounded-md border border-rule bg-surface px-4 py-2.5 text-sm">
                <span
                  className={`mr-2 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${
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
              aria-label="Lesson details"
              required
              rows={2}
              placeholder="What happened, and what should the next project like this do differently (or repeat)?"
              className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            />
            <SubmitButton pendingText="Adding…" className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
              Add lesson
            </SubmitButton>
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
