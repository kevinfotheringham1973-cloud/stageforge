"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { RoleCategory } from "@prisma/client";
import {
  getCurrentUserGlobalRoleKeys,
  getCurrentUserId,
  getCurrentUserRoleKeysForProject,
  getRealCurrentUserId,
  VIEW_AS_COOKIE_NAME,
} from "./session";
import { SHARE_LINK_COOKIE_NAME } from "./shareLinks";
import {
  canApproveSpend,
  canBypassDeliverable,
  canCoSignCompliance,
  canDecideGate,
  canManageScheduledReports,
  canOverrideCompliance,
  canRecordLessonLearned,
  canRecordSpend,
  canSetGateTimeline,
  isGateReadyForSponsor,
} from "./permissions";
import { instantiateStage } from "./instantiation";
import { matchComplianceTags } from "./provisioning";
import { effectiveComplianceTags, isCdmWorksType } from "./cdm";
import { issueNextProjectNumber } from "./projectNumber";
import { assignStandardTeam } from "./standardTeam";
import { suggestDisciplineTeam } from "./disciplineTeam";
import { resolveWorksPackageId } from "./worksPackages";
import { assertSameSectorVariant, constituentTemplateIds, loadConstituentTemplatesForInstantiation } from "./projectTemplates";
import { sendScheduledReport } from "./scheduledReportSender";
import { evidenceFolderPath, isSharePointConfigured, uploadEvidenceFile } from "./sharepoint";
import { isLocalEvidenceStorageEnabled, localEvidenceFolderPath, saveLocalEvidenceFile } from "./localEvidenceStorage";

/**
 * Admin-only "view as" -- lets a real, signed-in platform admin preview
 * the app as another person's role, for demos and support, without
 * that being a general-purpose login bypass. Replaces the old
 * setActingUser, which used to BE the entire auth model (24 Aug 2026 —
 * see session.ts's header comment on why that had to go). Layers on
 * top of a real Auth.js session rather than replacing it: session.ts's
 * getCurrentUserId() only honours this cookie when the real signed-in
 * user is a platform admin, so setting it from outside that context is
 * a no-op, not a privilege escalation.
 *
 * Worth knowing if this is ever used against real (not demo) data: any
 * write action taken while viewing-as is recorded under the VIEWED
 * user's id (uploadedById, signedOffBy, etc.), not the admin's real
 * identity -- fine for demo/support click-throughs, but not something
 * to lean on for real audit-trail-sensitive actions on live Trust data.
 */
export async function setViewAsUser(formData: FormData) {
  // Desktop build only -- see session.ts's getCurrentUserId for why
  // this can't be allowed to take effect there. Blocked here too
  // (belt-and-braces alongside the read-side guard) so the cookie is
  // never even set, not just ignored.
  if (process.env.STAGEFORGE_LOCAL_MODE === "1") return;

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  // Deliberately the REAL signed-in identity, not getCurrentUser() --
  // that's view-as-aware, so checking it here would check whichever
  // user is currently being previewed, not the actual admin.
  const realUserId = await getRealCurrentUserId();
  const realUser = realUserId ? await db.user.findUnique({ where: { id: realUserId } }) : null;
  if (!realUser?.isPlatformAdmin) return;

  const store = await cookies();
  store.set(VIEW_AS_COOKIE_NAME, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}

export async function clearViewAsUser() {
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE_NAME);
  revalidatePath("/", "layout");
}

/**
 * A gate starts NOT_STARTED; the first thing anyone does on any of its
 * deliverables/compliance/spend is what actually starts it — reused by
 * every action that can trigger that transition, so actualStartDate
 * (Gate timeline's "what really happened", not a target anyone typed
 * in) gets stamped exactly once, in exactly one place.
 */
function startGateUpdate(gateId: string, currentStatus: string) {
  return currentStatus === "NOT_STARTED"
    ? [
        db.gate.update({
          where: { id: gateId },
          data: { status: "IN_PROGRESS" as const, actualStartDate: new Date() },
        }),
      ]
    : [];
}

/**
 * bypassAuthority/overrideAuthority are open Role.key strings now, not
 * a fixed enum (23 Aug 2026, "fully dynamic authority roles") — every
 * caller that needs to know which roles are exact-match (SRO doesn't
 * inherit into them) or needs a display name fetches both here, the
 * same DB-read-at-the-call-site pattern permissions.ts's canBypass
 * and canOverrideCompliance already expect.
 */
async function fetchRoleAuthorityContext(): Promise<{
  exactMatchAuthorityKeys: Set<string>;
  roleNameByKey: Record<string, string>;
}> {
  const roles = await db.role.findMany({ select: { key: true, name: true, isExactMatchAuthority: true } });
  return {
    exactMatchAuthorityKeys: new Set(roles.filter((r) => r.isExactMatchAuthority).map((r) => r.key)),
    roleNameByKey: Object.fromEntries(roles.map((r) => [r.key, r.name])),
  };
}

/**
 * Reads the uploaded File from the form and resolves where it actually
 * lives, in priority order: the configured SharePoint site (real fileRef
 * = the Graph webUrl) when the AZURE_ and SHAREPOINT_ env vars are set;
 * else local disk (STAGEFORGE_LOCAL_MODE — the desktop build, see
 * localEvidenceStorage.ts) when that's on; else the inert dev stub that
 * discards the bytes and just records a fake reference. Same fallback
 * chain either way keeps the demo usable with zero setup, while flipping
 * on for real the moment credentials + a real site are in place — no
 * other code change needed.
 */
// Multiple files in one submission (26 Aug 2026, "it covers two
// systems... likely multiple file inputs") — a merged deliverable
// like "Contractor's detailed Method Statements" genuinely needs one
// file per constituent discipline, not one file standing in for both.
// All returned here share one upload batch (recordEvidenceStub gives
// them the same version number), unlike a later separate submission,
// which still supersedes this whole batch the same way a single
// replacement always has.
async function resolveEvidenceUploads(
  formData: FormData,
  project: { name: string; projectNumber: string },
  stageName: string
): Promise<{ fileName: string; fileRef: string }[]> {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("At least one file is required.");
  }

  const results: { fileName: string; fileRef: string }[] = [];
  for (const file of files) {
    if (isSharePointConfigured()) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const folderPath = evidenceFolderPath(project, stageName);
      const uploaded = await uploadEvidenceFile(folderPath, file.name, buffer);
      results.push({ fileName: file.name, fileRef: uploaded.webUrl });
    } else if (isLocalEvidenceStorageEnabled()) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const folderPath = localEvidenceFolderPath(project, stageName);
      const { servePath } = await saveLocalEvidenceFile(folderPath, file.name, buffer);
      results.push({ fileName: file.name, fileRef: servePath });
    } else {
      results.push({ fileName: file.name, fileRef: `local://dev-upload/${file.name}` });
    }
  }
  return results;
}

// Single-file callers (compliance evidence, spend invoices) — their
// forms never set `multiple` on the file input, so exactly one file
// is ever submitted; this just adapts resolveEvidenceUploads' shape
// rather than duplicating the SharePoint-vs-local-stub branching.
async function resolveEvidenceUpload(
  formData: FormData,
  project: { name: string; projectNumber: string },
  stageName: string
): Promise<{ fileName: string; fileRef: string }> {
  const [first] = await resolveEvidenceUploads(formData, project, stageName);
  return first!;
}

/**
 * Records evidence against a deliverable — the first upload, or a
 * replacement before sign-off (DataModel.html: "version history when
 * a file is replaced before sign-off"). "Who can upload" beyond "PM, or
 * whoever has this item's bypass authority" isn't pinned down in the
 * PRD yet.
 */
export async function recordEvidenceStub(
  deliverableId: string,
  projectNumber: string,
  gateId: string,
  formData: FormData
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: { stage: { include: { project: true } } },
  });
  if (gate.status === "SIGNED_OFF") {
    throw new Error("This gate is already signed off — evidence can't be replaced after the fact.");
  }

  // Every file in this ONE submission shares a single version number
  // (26 Aug 2026, "one description... but likely multiple file
  // inputs") — a merged deliverable like "Contractor's detailed Method
  // Statements" genuinely needs one file per constituent discipline
  // side by side as the current evidence, not one superseding the
  // other the way a real replacement would. A later, separate
  // submission still supersedes this whole batch, same as before.
  const uploads = await resolveEvidenceUploads(formData, gate.stage.project, gate.stage.name);

  const existingFiles = await db.evidenceFile.findMany({
    where: { deliverableId },
    orderBy: { version: "desc" },
    take: 1,
  });
  const nextVersion = (existingFiles[0]?.version ?? 0) + 1;
  const isReplacement = existingFiles.length > 0;

  await db.$transaction([
    db.evidenceFile.createMany({
      data: uploads.map((u) => ({
        deliverableId,
        fileName: u.fileName,
        fileRef: u.fileRef,
        version: nextVersion,
        uploadedById: userId,
      })),
    }),
    db.deliverable.update({
      where: { id: deliverableId },
      data: { status: "EVIDENCED" },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: userId,
        action: isReplacement ? "evidence.replaced" : "evidence.uploaded",
        gateId,
        entityType: "Deliverable",
        entityId: deliverableId,
      },
    }),
    ...startGateUpdate(gateId, gate.status),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

export async function bypassDeliverable(
  deliverableId: string,
  projectNumber: string,
  gateId: string,
  formData: FormData
) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to bypass a deliverable.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const deliverable = await db.deliverable.findUniqueOrThrow({ where: { id: deliverableId } });
  const gate = await db.gate.findUniqueOrThrow({ where: { id: gateId }, include: { stage: true } });
  const [roleKeys, globalRoleKeys, { exactMatchAuthorityKeys, roleNameByKey }] = await Promise.all([
    getCurrentUserRoleKeysForProject(gate.stage.projectId),
    getCurrentUserGlobalRoleKeys(),
    fetchRoleAuthorityContext(),
  ]);

  if (!canBypassDeliverable(roleKeys, deliverable.bypassAuthority, exactMatchAuthorityKeys, globalRoleKeys)) {
    throw new Error(
      `This deliverable requires ${roleNameByKey[deliverable.bypassAuthority] ?? deliverable.bypassAuthority} authority to bypass — your current roles on this project don't qualify.`
    );
  }

  await db.$transaction([
    db.deliverableBypass.create({ data: { deliverableId, bypassedById: userId, reason } }),
    db.deliverable.update({ where: { id: deliverableId }, data: { status: "BYPASSED" } }),
    db.auditLogEntry.create({
      data: { actorId: userId, action: "deliverable.bypassed", gateId, entityType: "Deliverable", entityId: deliverableId, reason },
    }),
    ...startGateUpdate(gateId, gate.status),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

/**
 * Records evidence against a compliance requirement — mirrors
 * recordEvidenceStub exactly, including the same real-SharePoint-vs-stub
 * resolution. A requirement clears normally with evidence, independently
 * of every other requirement on the gate — the all-at-once clearing
 * mechanic belongs to overrideCompliance below, not this.
 */
export async function recordComplianceEvidenceStub(
  complianceRequirementId: string,
  projectNumber: string,
  gateId: string,
  formData: FormData
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: { stage: { include: { project: true } } },
  });
  if (gate.status === "SIGNED_OFF") {
    throw new Error("This gate is already signed off — evidence can't be replaced after the fact.");
  }

  const { fileName, fileRef } = await resolveEvidenceUpload(formData, gate.stage.project, gate.stage.name);

  const existingFiles = await db.complianceEvidenceFile.findMany({
    where: { complianceRequirementId },
    orderBy: { version: "desc" },
    take: 1,
  });
  const nextVersion = (existingFiles[0]?.version ?? 0) + 1;
  const isReplacement = existingFiles.length > 0;

  await db.$transaction([
    db.complianceEvidenceFile.create({
      data: {
        complianceRequirementId,
        fileName,
        fileRef,
        version: nextVersion,
        uploadedById: userId,
      },
    }),
    db.complianceRequirement.update({
      where: { id: complianceRequirementId },
      data: { status: "EVIDENCED" },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: userId,
        action: isReplacement ? "compliance.evidence_replaced" : "compliance.evidence_uploaded",
        gateId,
        entityType: "ComplianceRequirement",
        entityId: complianceRequirementId,
      },
    }),
    ...startGateUpdate(gateId, gate.status),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

/**
 * One SRO action clears every outstanding compliance requirement on a
 * Gate at once — not a per-requirement bypass like bypassDeliverable
 * (DataModel.html §03 decided note). coveredRequirementIds snapshots
 * exactly which requirements were outstanding at the moment of
 * override, so the audit trail shows what was actually accepted even
 * if new requirements are added to the stage later.
 */
export async function overrideCompliance(gateId: string, projectNumber: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to override compliance requirements.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: { stage: true, complianceRequirements: true },
  });
  const [roleKeys, { exactMatchAuthorityKeys, roleNameByKey }] = await Promise.all([
    getCurrentUserRoleKeysForProject(gate.stage.projectId),
    fetchRoleAuthorityContext(),
  ]);

  const outstanding = gate.complianceRequirements.filter((c) => c.blocksGate && c.status === "PENDING");
  if (outstanding.length === 0) {
    throw new Error("There are no outstanding compliance requirements on this gate to override.");
  }

  // Overriding all outstanding requirements at once only works when the
  // actor holds authority for every one of them — a gate mixing an
  // ordinary SRO-tier item with a fire-domain one can't be cleared by
  // an SRO alone, since an SRO has no standing over the fire item (see
  // canOverrideCompliance). Those have to be resolved separately by
  // whoever actually holds each authority.
  const requiredAuthorities = Array.from(new Set(outstanding.map((c) => c.overrideAuthority)));
  const missingAuthorities = requiredAuthorities.filter(
    (auth) => !canOverrideCompliance(roleKeys, exactMatchAuthorityKeys, auth)
  );
  if (missingAuthorities.length > 0) {
    throw new Error(
      `Overriding every outstanding item on this gate at once requires ${missingAuthorities.map((a) => roleNameByKey[a] ?? a).join(" and ")} authority — you're missing ${missingAuthorities.length > 1 ? "these" : "this"}.`
    );
  }

  await db.$transaction([
    db.complianceOverride.create({
      data: {
        gateId,
        overriddenById: userId,
        reason,
        coveredRequirementIds: outstanding.map((c) => c.id),
      },
    }),
    db.complianceRequirement.updateMany({
      where: { id: { in: outstanding.map((c) => c.id) } },
      data: { status: "OVERRIDDEN" },
    }),
    db.auditLogEntry.create({
      data: { actorId: userId, action: "compliance.overridden", gateId, entityType: "Gate", entityId: gateId, reason },
    }),
    ...startGateUpdate(gateId, gate.status),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

/**
 * Records one required additional party's independent sign-off on a
 * compliance requirement (ComplianceRuleTemplate/ComplianceRequirement
 * .additionalApproverRoleKeys) — parallel, not sequential, and layered
 * on top of the normal evidence/override flow rather than replacing
 * it: a requirement only counts as gate-clear once its own status is
 * resolved AND every required role here has co-signed (see
 * isComplianceRequirementClear in permissions.ts). Deliberately a
 * plain exact-match on roleKey, no SRO apex — this is meant to be a
 * genuinely independent second party, not another route to the same
 * authority the primary evidence/override already used.
 */
export async function recordComplianceCoSignOff(
  complianceRequirementId: string,
  projectNumber: string,
  gateId: string,
  roleKey: string
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const requirement = await db.complianceRequirement.findUniqueOrThrow({
    where: { id: complianceRequirementId },
    include: { gate: { include: { stage: true } } },
  });
  if (!requirement.additionalApproverRoleKeys.includes(roleKey)) {
    throw new Error(`This requirement doesn't ask for a ${roleKey} sign-off.`);
  }
  if (requirement.status !== "EVIDENCED" && requirement.status !== "OVERRIDDEN") {
    throw new Error("This requirement needs evidence or an override before it can be signed off.");
  }

  const roleKeys = await getCurrentUserRoleKeysForProject(requirement.gate.stage.projectId);
  if (!canCoSignCompliance(roleKeys, roleKey)) {
    throw new Error(`Only someone holding the ${roleKey} role on this project can sign this off.`);
  }

  await db.$transaction([
    db.complianceCoSignOff.create({
      data: { complianceRequirementId, roleKey, signedOffById: userId },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: userId,
        action: "compliance.cosigned",
        gateId,
        entityType: "ComplianceRequirement",
        entityId: complianceRequirementId,
        reason: `Signed off as ${roleKey}`,
      },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

/**
 * Records an invoice-level spend against a gate (FinancialModel.html,
 * revised: spend is checked and approved at each gate). PM/SRO —
 * the PM logs what's been spent, Finance checks it. Starts PENDING —
 * blocks the gate (isGateReadyForSponsor) until Finance/SRO approves
 * it via approveSpend.
 */
export async function recordSpend(gateId: string, projectNumber: string, formData: FormData) {
  const bucket = String(formData.get("bucket") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const invoiceReference = String(formData.get("invoiceReference") ?? "").trim();
  if (!["LIFECYCLE_REPLACEMENT", "SMALL_WORKS", "VARIATION"].includes(bucket)) {
    throw new Error("A valid approval bucket is required.");
  }
  if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error("A positive amount is required.");
  }
  if (!description) throw new Error("A description is required.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({ where: { id: gateId }, include: { stage: true } });
  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!canRecordSpend(roleKeys)) {
    throw new Error("Recording spend requires the Project Manager or SRO role.");
  }

  await db.$transaction([
    db.spendRecord.create({
      data: {
        gateId,
        bucket: bucket as "LIFECYCLE_REPLACEMENT" | "SMALL_WORKS" | "VARIATION",
        amount,
        description,
        invoiceReference: invoiceReference || null,
        recordedById: userId,
      },
    }),
    db.auditLogEntry.create({
      data: { actorId: userId, action: "spend.recorded", gateId, entityType: "Gate", entityId: gateId },
    }),
    ...startGateUpdate(gateId, gate.status),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
  revalidatePath("/finance");
}

/**
 * Attaches an invoice document to a spend record — the amount and
 * invoice reference alone aren't enough for Finance to approve against
 * (23 Aug 2026 decision); approveSpend below now requires at least one
 * of these. Same PM/SRO authority as recording spend in the first
 * place, and same real-SharePoint-vs-stub resolution as evidence
 * uploads. Plain list, not "latest wins": a record can genuinely have
 * more than one invoice (part-invoiced work, split POs), so there's no
 * version/replace here — only PENDING records take new invoices, same
 * boundary as reviseSpend.
 */
export async function uploadSpendInvoice(
  spendRecordId: string,
  projectNumber: string,
  gateId: string,
  formData: FormData
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const spendRecord = await db.spendRecord.findUniqueOrThrow({
    where: { id: spendRecordId },
    include: { gate: { include: { stage: { include: { project: true } } } } },
  });
  const roleKeys = await getCurrentUserRoleKeysForProject(spendRecord.gate.stage.projectId);
  if (!canRecordSpend(roleKeys)) {
    throw new Error("Attaching an invoice requires the Project Manager or SRO role.");
  }
  if (spendRecord.status !== "PENDING") {
    throw new Error("Only a pending spend record can take a new invoice — an approved one is locked.");
  }

  const { fileName, fileRef } = await resolveEvidenceUpload(
    formData,
    spendRecord.gate.stage.project,
    spendRecord.gate.stage.name
  );

  await db.$transaction([
    db.spendInvoiceFile.create({ data: { spendRecordId, fileName, fileRef, uploadedById: userId } }),
    db.auditLogEntry.create({
      data: { actorId: userId, action: "spend.invoice_uploaded", gateId, entityType: "SpendRecord", entityId: spendRecordId },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

async function decideSpend(
  spendRecordId: string,
  projectNumber: string,
  gateId: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | null
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const spendRecord = await db.spendRecord.findUniqueOrThrow({
    where: { id: spendRecordId },
    include: { gate: { include: { stage: true } }, invoiceFiles: true },
  });
  const roleKeys = await getCurrentUserRoleKeysForProject(spendRecord.gate.stage.projectId);
  if (!canApproveSpend(roleKeys)) {
    throw new Error("Approving spend requires Finance or SRO authority.");
  }
  if (spendRecord.status !== "PENDING") {
    throw new Error("This spend record has already been approved.");
  }
  if (decision === "REJECTED" && !reason?.trim()) {
    throw new Error("Rejecting a spend record requires a written reason.");
  }
  if (decision === "APPROVED" && spendRecord.invoiceFiles.length === 0) {
    throw new Error("This spend record has no invoice attached yet — the PM needs to upload one before it can be approved.");
  }

  // Rejection leaves the record PENDING, editable, not a dead end —
  // the reason lives on this SpendApproval row, same pattern as every
  // other decision-history entity in this app.
  await db.$transaction([
    db.spendApproval.create({ data: { spendRecordId, decision, approvedById: userId, reason } }),
    ...(decision === "APPROVED"
      ? [db.spendRecord.update({ where: { id: spendRecordId }, data: { status: "APPROVED" as const } })]
      : []),
    db.auditLogEntry.create({
      data: {
        actorId: userId,
        action: decision === "APPROVED" ? "spend.approved" : "spend.rejected",
        gateId,
        entityType: "SpendRecord",
        entityId: spendRecordId,
        reason,
      },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
  revalidatePath("/finance");
}

export async function approveSpend(spendRecordId: string, projectNumber: string, gateId: string) {
  await decideSpend(spendRecordId, projectNumber, gateId, "APPROVED", null);
}

export async function rejectSpend(spendRecordId: string, projectNumber: string, gateId: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  await decideSpend(spendRecordId, projectNumber, gateId, "REJECTED", reason);
}

/**
 * Edits a PENDING spend record's amount/bucket/description/invoice
 * reference in place — the alternative to reject-then-record-again for
 * a mistaken entry (FinancialModel.html §05, "deferred" item, now
 * built). Same PM/SRO authority as recording it in the first place —
 * not scoped to whoever originally recorded it, same as every other
 * "domain owner acts" permission in this app. Once a record is
 * APPROVED it's locked — revising an approved figure without a fresh
 * approval would silently invalidate that sign-off, so this only ever
 * touches PENDING rows.
 */
export async function reviseSpend(spendRecordId: string, projectNumber: string, gateId: string, formData: FormData) {
  const bucket = String(formData.get("bucket") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const invoiceReference = String(formData.get("invoiceReference") ?? "").trim();
  if (!["LIFECYCLE_REPLACEMENT", "SMALL_WORKS", "VARIATION"].includes(bucket)) {
    throw new Error("A valid approval bucket is required.");
  }
  if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error("A positive amount is required.");
  }
  if (!description) throw new Error("A description is required.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const spendRecord = await db.spendRecord.findUniqueOrThrow({
    where: { id: spendRecordId },
    include: { gate: { include: { stage: true } } },
  });
  const roleKeys = await getCurrentUserRoleKeysForProject(spendRecord.gate.stage.projectId);
  if (!canRecordSpend(roleKeys)) {
    throw new Error("Revising spend requires the Project Manager or SRO role.");
  }
  if (spendRecord.status !== "PENDING") {
    throw new Error("Only a pending spend record can be revised — an approved one is locked.");
  }

  await db.$transaction([
    db.spendRecord.update({
      where: { id: spendRecordId },
      data: {
        bucket: bucket as "LIFECYCLE_REPLACEMENT" | "SMALL_WORKS" | "VARIATION",
        amount,
        description,
        invoiceReference: invoiceReference || null,
      },
    }),
    db.auditLogEntry.create({
      data: { actorId: userId, action: "spend.revised", gateId, entityType: "SpendRecord", entityId: spendRecordId },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
  revalidatePath("/finance");
}

/**
 * Removes a PENDING spend record entirely — the "delete a mistaken
 * entry" option FinancialModel.html §08 left open, decided (22
 * Aug 2026) in favour of allowing it rather than forcing reviseSpend
 * or reject-then-record-again for a record that should never have
 * existed at all. Same PM/SRO authority and PENDING-only restriction
 * as reviseSpend — once APPROVED, a record is locked, full stop.
 * Not a soft delete: follows deleteProject's exact shape (the one
 * other genuine hard-delete in this app) — the record's own prior
 * audit trail (spend.recorded, any spend.revised/rejected entries) is
 * removed with it rather than left dangling against a row that no
 * longer exists, and replaced with one new `spend.deleted` entry that
 * captures what was removed and the reason, so there's still exactly
 * one forensic breadcrumb rather than either silent removal or a pile
 * of orphaned history about a thing that isn't there any more.
 */
export async function deleteSpendRecord(spendRecordId: string, projectNumber: string, gateId: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to delete a spend record.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const spendRecord = await db.spendRecord.findUniqueOrThrow({
    where: { id: spendRecordId },
    include: { gate: { include: { stage: true } } },
  });
  const roleKeys = await getCurrentUserRoleKeysForProject(spendRecord.gate.stage.projectId);
  if (!canRecordSpend(roleKeys)) {
    throw new Error("Deleting a spend record requires the Project Manager or SRO role.");
  }
  if (spendRecord.status !== "PENDING") {
    throw new Error("Only a pending spend record can be deleted — an approved one is locked, same as revising it.");
  }

  const amountLabel = `£${Number(spendRecord.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

  await db.$transaction([
    db.spendApproval.deleteMany({ where: { spendRecordId } }),
    db.spendInvoiceFile.deleteMany({ where: { spendRecordId } }),
    db.auditLogEntry.deleteMany({ where: { entityType: "SpendRecord", entityId: spendRecordId } }),
    db.spendRecord.delete({ where: { id: spendRecordId } }),
    db.auditLogEntry.create({
      data: {
        actorId: userId,
        action: "spend.deleted",
        gateId,
        entityType: "SpendRecord",
        entityId: spendRecordId,
        reason: `${amountLabel} (${spendRecord.bucket}) "${spendRecord.description}" — ${reason}`,
      },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
  revalidatePath("/finance");
}

export async function submitForApproval(gateId: string, projectNumber: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: {
      stage: true,
      deliverables: true,
      complianceRequirements: { include: { coSignOffs: true } },
      spendRecords: true,
    },
  });

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager submits a gate for Sponsor approval.");
  }
  if (!isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements, gate.spendRecords)) {
    throw new Error(
      "Every deliverable must be evidenced or bypassed, every compliance requirement evidenced or overridden, and every spend record approved, before this gate can be submitted."
    );
  }

  await db.$transaction([
    db.gate.update({ where: { id: gateId }, data: { status: "AWAITING_SPONSOR" } }),
    db.auditLogEntry.create({
      data: { actorId: userId, action: "gate.submitted_for_approval", gateId, entityType: "Gate", entityId: gateId },
    }),
  ]);
  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

async function decide(
  gateId: string,
  projectNumber: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | null
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: {
      stage: true,
      deliverables: true,
      complianceRequirements: { include: { coSignOffs: true } },
      spendRecords: true,
    },
  });

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!canDecideGate(roleKeys)) {
    throw new Error("Only the Project Sponsor can approve or reject a gate.");
  }
  if (gate.status !== "AWAITING_SPONSOR") {
    throw new Error("This gate hasn't been submitted for approval yet.");
  }
  if (decision === "APPROVED" && !isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements, gate.spendRecords)) {
    throw new Error("This gate still has outstanding deliverables, compliance requirements, or unapproved spend — it isn't ready for approval.");
  }
  if (decision === "REJECTED" && !reason?.trim()) {
    throw new Error("Rejecting a gate requires a written reason.");
  }

  // Rejection returns the gate to IN_PROGRESS rather than a terminal
  // state — the reason lives on this GateSignOff row for the PM to see.
  await db.$transaction([
    db.gateSignOff.create({ data: { gateId, decision, signedOffById: userId, reason } }),
    db.gate.update({
      where: { id: gateId },
      data: {
        status: decision === "APPROVED" ? "SIGNED_OFF" : "IN_PROGRESS",
        ...(decision === "APPROVED" ? { actualEndDate: new Date() } : {}),
      },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: userId,
        action: decision === "APPROVED" ? "gate.signed_off" : "gate.rejected",
        gateId,
        entityType: "Gate",
        entityId: gateId,
        reason,
      },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

export async function approveGate(gateId: string, projectNumber: string) {
  await decide(gateId, projectNumber, "APPROVED", null);
}

export async function rejectGate(gateId: string, projectNumber: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  await decide(gateId, projectNumber, "REJECTED", reason);
}

/**
 * A PM reinstating a stage they'd previously excluded from the
 * project's scope. Confirmed: it appends after the
 * project's current furthest stage, never reinserting into the
 * template's original order — reinstating never reshuffles stages
 * already underway or complete (ConfigSchema.html §06).
 */
export async function reinstateStage(
  projectId: string,
  stageKey: string,
  projectNumber: string
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserRoleKeysForProject(projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager can reinstate a stage.");
  }

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { additionalTemplates: true },
  });

  const templates = await loadConstituentTemplatesForInstantiation(db, project);
  assertSameSectorVariant(templates);
  const matchingStageTemplates = templates.flatMap((t) => t.stageTemplates).filter((st) => st.key === stageKey);
  if (matchingStageTemplates.length === 0) {
    throw new Error("This stage isn't defined by any of this project's templates.");
  }

  const alreadyInstantiated = await db.stage.findFirst({
    where: { projectId, key: stageKey },
  });
  if (alreadyInstantiated) {
    throw new Error("This stage is already part of the project.");
  }

  const { _max } = await db.stage.aggregate({ where: { projectId }, _max: { order: true } });
  const nextOrder = (_max.order ?? -1) + 1;

  const { stage } = await instantiateStage(db, {
    projectId,
    projectTags: effectiveComplianceTags(project, templates.map((t) => t.key)),
    sectorVariantId: templates[0]!.sectorVariantId,
    order: nextOrder,
    stageTemplates: matchingStageTemplates,
  });

  await db.project.update({
    where: { id: projectId },
    data: { includedStageKeys: { push: stageKey } },
  });

  await db.auditLogEntry.create({
    data: {
      actorId: userId,
      action: "stage.reinstated",
      entityType: "Stage",
      entityId: stage.id,
    },
  });

  revalidatePath(`/projects/${projectNumber}`);
}

// ── AI-assisted provisioning (ProvisioningModel.html) ──────────────────
// Draft → review → activate. No REJECTED status — a revision request
// leaves the Project in DRAFT with a ProvisioningReview(REVISE, reason)
// row, same "return to editable state with a reason" pattern as gate
// rejection, not a dead end.

/**
 * PM or Compliance Officer enters a free-text project description;
 * the LLM match (§07) proposes a Template and tags; a DRAFT Project is
 * created carrying that proposal, with no Stages/Gates instantiated
 * yet. The standing hospital team (lib/standardTeam.ts) is assigned
 * immediately, not just the creator as PM — role assignment isn't an
 * open question once every project is for the same hospital.
 */
export async function createProvisioningDraft(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const worksType = String(formData.get("worksType") ?? "");
  const additionalTemplateIds = formData
    .getAll("additionalTemplateIds")
    .map((v) => String(v).trim())
    .filter((id) => id && id !== templateId);
  if (!name || !brief) {
    throw new Error("Project name and description are both required.");
  }
  if (!templateId) {
    throw new Error("A system/Template must be selected.");
  }
  if (!isCdmWorksType(worksType)) {
    throw new Error(
      "The CDM 2015 works-type question is required: single-contractor direct replacement, multiple-contractor direct replacement, or building modification?"
    );
  }
  const notifiableUnderCdmRaw = String(formData.get("notifiableUnderCdm") ?? "");
  if (notifiableUnderCdmRaw !== "true" && notifiableUnderCdmRaw !== "false") {
    throw new Error("The F10 notification question is required.");
  }
  const notifiableUnderCdm = notifiableUnderCdmRaw === "true";

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  // The only signal distinguishing "brand-new project" from "add a
  // system to an already-existing Works Package" (reached from that
  // package's own detail page, which preselects it as a hidden field —
  // see NewProjectForm.tsx) is whether this form submission carries an
  // explicit worksPackageId. That other entry point keeps its original
  // sibling-project behavior untouched below; a brand-new project's
  // "additional systems" checkboxes instead merge into this one Project
  // (26 Aug 2026, "true merge" — see ProjectAdditionalTemplate in
  // schema.prisma for why this is a deliberate reversal of the
  // WorksPackage model's "never a merge of checklists" comment for
  // just this one entry point).
  const explicitWorksPackageId = String(formData.get("worksPackageId") ?? "").trim();

  if (explicitWorksPackageId) {
    // Works Package (21 Aug 2026): a hospital runs 24/7, so extra
    // opportunistic work often bundles into the same disruption window as
    // the project that triggered it — a purely organisational link between
    // otherwise-independent, discipline-pure Projects, never a merge of
    // their checklists. "There are times when multiple systems are
    // required" (21 Aug 2026) — the works-package box doubles as a
    // bundler: any additional systems checked there become sibling DRAFT
    // projects in the same package as this one, created in the same
    // submission. Each still goes through its own Compliance Officer
    // review before going live — this only replaces re-filling the form
    // once per system.
    const resolvedWorksPackage = await resolveWorksPackageId(
      db,
      userId,
      formData,
      additionalTemplateIds.length > 0 ? name : undefined
    );

    const template = await db.template.findUniqueOrThrow({
      where: { id: templateId },
      include: { stageTemplates: { orderBy: { order: "asc" } } },
    });

    const match = await matchComplianceTags(db, templateId, brief);

    const projectNumber = await issueNextProjectNumber(template.sectorVariantId);

    const project = await db.project.create({
      data: {
        projectNumber,
        name,
        templateId: template.id,
        worksPackageId: resolvedWorksPackage?.id ?? null,
        // Every RIBA-aligned Template shares the same stage keys (PRD.html
        // §06 decided flag) — default to all of them, per §05's "default
        // to all 8, editable later" resolution.
        includedStageKeys: template.stageTemplates.map((st) => st.key),
        tags: match.tags,
        worksType,
        notifiableUnderCdm,
        status: "DRAFT",
        createdById: userId,
        provisioningBrief: brief,
        provisioningMatchReasoning: match.reasoning,
      },
    });

    // PM from whoever actually created it, plus the standing hospital
    // team (lib/standardTeam.ts) for everything else — a project no
    // longer starts with every other role (Sponsor, SRO, Compliance
    // Officer, Finance, ...) simply missing until someone notices and
    // fills it in by hand.
    await assignStandardTeam(project.id, userId);
    // Discipline-specific roster (lib/disciplineTeam.ts) — AP/AE, Clinical
    // Safety/Information Governance, Principal Designer — suggested from
    // what this template's own deliverables actually gate on. Re-run at
    // approveProvisioning too, in case the template changes between now
    // and then; upserts, so running it twice is harmless.
    await suggestDisciplineTeam(project.id, [template.id], worksType);

    await db.auditLogEntry.create({
      data: { actorId: userId, action: "project.provisioning_drafted", entityType: "Project", entityId: project.id },
    });

    for (const extraTemplateId of additionalTemplateIds) {
      const extraTemplate = await db.template.findUniqueOrThrow({
        where: { id: extraTemplateId },
        include: { stageTemplates: { orderBy: { order: "asc" } } },
      });
      const extraMatch = await matchComplianceTags(db, extraTemplateId, brief);
      const extraProjectNumber = await issueNextProjectNumber(extraTemplate.sectorVariantId);

      const extraProject = await db.project.create({
        data: {
          projectNumber: extraProjectNumber,
          name: `${resolvedWorksPackage!.name} — ${extraTemplate.name}`,
          templateId: extraTemplate.id,
          worksPackageId: resolvedWorksPackage!.id,
          includedStageKeys: extraTemplate.stageTemplates.map((st) => st.key),
          tags: extraMatch.tags,
          worksType,
          notifiableUnderCdm,
          status: "DRAFT",
          createdById: userId,
          provisioningBrief: brief,
          provisioningMatchReasoning: extraMatch.reasoning,
        },
      });

      await assignStandardTeam(extraProject.id, userId);
      await suggestDisciplineTeam(extraProject.id, [extraTemplate.id], worksType);

      await db.auditLogEntry.create({
        data: { actorId: userId, action: "project.provisioning_drafted", entityType: "Project", entityId: extraProject.id },
      });
    }

    if (additionalTemplateIds.length > 0 && resolvedWorksPackage) {
      revalidatePath("/");
      redirect(`/works-packages/${resolvedWorksPackage.id}`);
    }

    redirect(`/projects/${projectNumber}/provisioning`);
  }

  // Brand-new-project MERGE path: every checked "additional system"
  // folds into this one Project instead of spawning a sibling.
  const allTemplateIds = [templateId, ...additionalTemplateIds];
  const templates = await db.template.findMany({
    where: { id: { in: allTemplateIds } },
    include: { stageTemplates: { orderBy: { order: "asc" } } },
  });
  assertSameSectorVariant(templates);

  const primaryTemplate = templates.find((t) => t.id === templateId)!;
  const matches = await Promise.all(templates.map((t) => matchComplianceTags(db, t.id, brief)));
  const tags = Array.from(new Set(matches.flatMap((m) => m.tags))).sort();
  const reasoning = templates.map((t, i) => `[${t.name}] ${matches[i]!.reasoning}`).join("\n\n");
  const includedStageKeys = Array.from(new Set(templates.flatMap((t) => t.stageTemplates.map((st) => st.key))));

  const projectNumber = await issueNextProjectNumber(primaryTemplate.sectorVariantId);
  const project = await db.project.create({
    data: {
      projectNumber,
      name,
      templateId: primaryTemplate.id,
      worksPackageId: null,
      includedStageKeys,
      tags,
      worksType,
      notifiableUnderCdm,
      status: "DRAFT",
      createdById: userId,
      provisioningBrief: brief,
      provisioningMatchReasoning: reasoning,
      additionalTemplates: { create: additionalTemplateIds.map((id) => ({ templateId: id })) },
    },
  });

  await assignStandardTeam(project.id, userId);
  await suggestDisciplineTeam(project.id, allTemplateIds, worksType);

  await db.auditLogEntry.create({
    data: { actorId: userId, action: "project.provisioning_drafted", entityType: "Project", entityId: project.id },
  });

  redirect(`/projects/${projectNumber}/provisioning`);
}

/**
 * The drafting PM edits the brief after a REVISE decision; re-runs the
 * match; overwrites the proposed template/tags/reasoning on the same
 * Project row — no new project number.
 */
export async function reviseProvisioningBrief(projectId: string, projectNumber: string, formData: FormData) {
  const brief = String(formData.get("brief") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!brief) throw new Error("A description is required.");
  if (!templateId) throw new Error("A system/Template must be selected.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { additionalTemplates: true } });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");
  if (project.createdById !== userId) {
    throw new Error("Only the project's creator can revise the description.");
  }
  if (project.additionalTemplates.length > 0) {
    // This draft was created as a merge of multiple systems (see
    // ProjectAdditionalTemplate) — this form only edits the primary
    // template, so guard against picking one that's incompatible with
    // the additional templates already merged in.
    const newConstituents = await db.template.findMany({
      where: { id: { in: [templateId, ...project.additionalTemplates.map((a) => a.templateId)] } },
      select: { name: true, sectorVariantId: true },
    });
    assertSameSectorVariant(newConstituents);
  }

  const match = await matchComplianceTags(db, templateId, brief);

  await db.project.update({
    where: { id: projectId },
    data: {
      provisioningBrief: brief,
      provisioningMatchReasoning: match.reasoning,
      templateId,
      tags: match.tags,
    },
  });

  await db.auditLogEntry.create({
    data: { actorId: userId, action: "project.provisioning_revised", entityType: "Project", entityId: projectId },
  });

  revalidatePath(`/projects/${projectNumber}/provisioning`);
}

/**
 * A Compliance Officer directly overrides the proposed template/tags
 * without re-running the LLM — the reviewer just knows better. Same
 * authority tier as authoring template content (ConfigSchema.html §06).
 */
export async function updateProvisioningDraft(projectId: string, projectNumber: string, formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const worksType = String(formData.get("worksType") ?? "");
  if (!isCdmWorksType(worksType)) {
    throw new Error("A valid CDM 2015 works-type answer is required.");
  }
  const notifiableUnderCdmRaw = String(formData.get("notifiableUnderCdm") ?? "");
  if (notifiableUnderCdmRaw !== "true" && notifiableUnderCdmRaw !== "false") {
    throw new Error("A valid F10 notification answer is required.");
  }
  const notifiableUnderCdm = notifiableUnderCdmRaw === "true";

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserGlobalRoleKeys();
  if (!roleKeys.includes("COMPLIANCE_OFFICER")) {
    throw new Error("Only a Compliance Officer can override a provisioning draft's proposed match.");
  }

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { additionalTemplates: true } });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");

  const nextTemplateId = templateId || project.templateId;
  if (project.additionalTemplates.length > 0) {
    // Same guard as reviseProvisioningBrief — this form only edits the
    // primary template, so check the override doesn't produce an
    // incoherent (cross-sector-variant) merge.
    const newConstituents = await db.template.findMany({
      where: { id: { in: [nextTemplateId, ...project.additionalTemplates.map((a) => a.templateId)] } },
      select: { name: true, sectorVariantId: true },
    });
    assertSameSectorVariant(newConstituents);
  }

  await db.project.update({
    where: { id: projectId },
    data: { templateId: nextTemplateId, tags, worksType, notifiableUnderCdm },
  });

  await db.auditLogEntry.create({
    data: { actorId: userId, action: "project.provisioning_draft_overridden", entityType: "Project", entityId: projectId },
  });

  revalidatePath(`/projects/${projectNumber}/provisioning`);
}

/** Reason required — same mandatory-reason pattern as every override/bypass/rejection in the model. */
export async function requestProvisioningRevision(projectId: string, projectNumber: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to send a draft back for revision.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserGlobalRoleKeys();
  if (!roleKeys.includes("COMPLIANCE_OFFICER")) {
    throw new Error("Only a Compliance Officer can request a revision.");
  }

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");

  await db.provisioningReview.create({
    data: { projectId, decision: "REVISE", reviewedById: userId, reason },
  });

  await db.auditLogEntry.create({
    data: {
      actorId: userId,
      action: "project.provisioning_revision_requested",
      entityType: "Project",
      entityId: projectId,
      reason,
    },
  });

  revalidatePath(`/projects/${projectNumber}/provisioning`);
}

/**
 * Instantiates every included Stage/Gate from the project's constituent
 * template(s) — calls the same instantiateStage helper reinstateStage
 * uses, not new logic (ProvisioningModel.html §06) — and flips the
 * Project to ACTIVE. A merged project (ProjectAdditionalTemplate rows
 * present) groups every constituent template's StageTemplates by shared
 * key first, so a stage key common to two templates gets exactly one
 * Gate carrying both templates' deliverables, not two parallel gates.
 */
export async function approveProvisioning(projectId: string, projectNumber: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserGlobalRoleKeys();
  if (!roleKeys.includes("COMPLIANCE_OFFICER")) {
    throw new Error("Only a Compliance Officer can approve a provisioning draft.");
  }

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { additionalTemplates: true },
  });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");

  await db.provisioningReview.create({
    data: { projectId, decision: "APPROVED", reviewedById: userId },
  });

  const templates = await loadConstituentTemplatesForInstantiation(db, project);
  assertSameSectorVariant(templates);
  const templateIds = constituentTemplateIds(project);

  // Re-run the discipline-roster suggestion (lib/disciplineTeam.ts)
  // against the final template set — the PM's revise-and-rematch or a
  // Compliance Officer's direct override (updateProvisioningDraft) can
  // both change templateId after the draft-creation suggestion ran.
  await suggestDisciplineTeam(projectId, templateIds, project.worksType);

  // Group every constituent template's StageTemplates by shared key —
  // the primary template's own stage order wins; any stage key only an
  // additional template defines is appended after.
  const primaryTemplate = templates.find((t) => t.id === project.templateId)!;
  const byKey = new Map<string, (typeof templates)[number]["stageTemplates"]>();
  for (const t of templates) {
    for (const st of t.stageTemplates) {
      if (!byKey.has(st.key)) byKey.set(st.key, []);
      byKey.get(st.key)!.push(st);
    }
  }
  const orderedKeys = [
    ...primaryTemplate.stageTemplates.map((st) => st.key),
    ...Array.from(byKey.keys()).filter((k) => !primaryTemplate.stageTemplates.some((st) => st.key === k)),
  ];

  const includedStageKeys = new Set(project.includedStageKeys);
  let order = 0;
  for (const key of orderedKeys) {
    if (!includedStageKeys.has(key)) continue;
    await instantiateStage(db, {
      projectId,
      projectTags: effectiveComplianceTags(project, templates.map((t) => t.key)),
      sectorVariantId: templates[0]!.sectorVariantId,
      order,
      stageTemplates: byKey.get(key)!,
    });
    order += 1;
  }

  await db.project.update({ where: { id: projectId }, data: { status: "ACTIVE" } });

  await db.auditLogEntry.create({
    data: { actorId: userId, action: "project.provisioned", entityType: "Project", entityId: projectId },
  });

  revalidatePath(`/projects/${projectNumber}`);
  redirect(`/projects/${projectNumber}`);
}

// ── Resource/Capacity view (ResourceCapacityModel.html) ─────────────────

/**
 * PM sets a delivery-facing team member's % FTE allocation on their own
 * project. Current-state only — a straight overwrite, no time period
 * (§03 decided). Read-only for the Resource Manager (§05): they view
 * the aggregate, they don't edit individual numbers here.
 */
export async function setResourceAllocation(
  projectId: string,
  targetUserId: string,
  projectNumber: string,
  formData: FormData
) {
  const raw = String(formData.get("allocationPercent") ?? "").trim();
  const allocationPercent = Number(raw);
  if (!Number.isInteger(allocationPercent) || allocationPercent < 0 || allocationPercent > 100) {
    throw new Error("Allocation must be a whole number between 0 and 100.");
  }

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserRoleKeysForProject(projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager can set resource allocation.");
  }

  await db.resourceAllocation.upsert({
    where: { userId_projectId: { userId: targetUserId, projectId } },
    create: { userId: targetUserId, projectId, allocationPercent, updatedById: actorId },
    update: { allocationPercent, updatedById: actorId },
  });

  await db.auditLogEntry.create({
    data: {
      actorId,
      action: "resource.allocation_updated",
      entityType: "ResourceAllocation",
      entityId: `${targetUserId}:${projectId}`,
    },
  });

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath("/resources");
}

/**
 * Undoes a mistaken assignUserToProject — same "Project Manager on
 * THIS project" authority setResourceAllocation above uses, since
 * managing who's on the team (and their %) is already this page's
 * boundary. Returns { error } via useActionState (rather than
 * throwing) so an unexpected condition — someone else already removed
 * this exact assignment, e.g. from another tab — shows a plain
 * message instead of Next's generic minified error.
 */
export async function removeRoleAssignment(
  assignmentId: string,
  projectId: string,
  projectNumber: string,
  _prevState: { error?: string } | undefined,
): Promise<{ error?: string }> {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserRoleKeysForProject(projectId);
  if (!roleKeys.includes("PM")) {
    return { error: "Only the Project Manager can remove someone from the project team." };
  }

  const assignment = await db.projectRoleAssignment.findUnique({
    where: { id: assignmentId },
    include: { role: true, user: true },
  });
  if (!assignment || assignment.projectId !== projectId) {
    return { error: "That assignment no longer exists — refresh the page and try again." };
  }

  await db.$transaction([
    db.projectRoleAssignment.delete({ where: { id: assignmentId } }),
    db.auditLogEntry.create({
      data: {
        actorId,
        action: "user.removed_from_project",
        entityType: "ProjectRoleAssignment",
        entityId: assignmentId,
        reason: `${assignment.user.name} removed from ${assignment.role.name}`,
      },
    }),
  ]);

  // "layout" too -- if this was their last assignment, they're no
  // longer eligible for the admin "view as" switcher (src/app/layout.tsx),
  // which lives outside this route.
  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath("/team");
  revalidatePath("/", "layout");
  return {};
}

// ── Timeline (planned vs. actual) ───────────────────────────────────────

/**
 * PM sets or revises a gate's planned start/end dates — pure planning
 * input, straight overwrite, no approval workflow (unlike everything
 * else on a gate, this doesn't gate the gate). Actual dates are never
 * user-settable — they're stamped automatically by startGateUpdate and
 * decide() above, the moment the real thing happens.
 */
export async function setGateTimeline(gateId: string, projectNumber: string, formData: FormData) {
  const targetStartRaw = String(formData.get("targetStartDate") ?? "").trim();
  const targetEndRaw = String(formData.get("targetEndDate") ?? "").trim();
  const targetStartDate = targetStartRaw ? new Date(targetStartRaw) : null;
  const targetEndDate = targetEndRaw ? new Date(targetEndRaw) : null;
  if (targetStartDate && targetEndDate && targetStartDate > targetEndDate) {
    throw new Error("Target start date must be on or before the target end date.");
  }

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({ where: { id: gateId }, include: { stage: true } });
  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!canSetGateTimeline(roleKeys)) {
    throw new Error("Only the Project Manager can set a gate's target dates.");
  }

  await db.$transaction([
    db.gate.update({ where: { id: gateId }, data: { targetStartDate, targetEndDate } }),
    db.auditLogEntry.create({
      data: { actorId, action: "timeline.target_set", gateId, entityType: "Gate", entityId: gateId },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

// ── Lessons learned ──────────────────────────────────────────────────

/**
 * Any project stakeholder can log a lesson at any point in a gate's
 * life — canRecordLessonLearned (permissions.ts) deliberately doesn't
 * lock this to one role, unlike everything else on a gate. Shows up
 * both on this gate and, grouped by Gate.key, on the portfolio-wide
 * /lessons-learned view.
 */
export async function recordLessonLearned(gateId: string, projectNumber: string, formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (type !== "WENT_WELL" && type !== "TO_IMPROVE") {
    throw new Error("A valid lesson type is required.");
  }
  if (!text) throw new Error("Lesson text is required.");

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({ where: { id: gateId }, include: { stage: true } });
  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!canRecordLessonLearned(roleKeys)) {
    throw new Error("Only someone holding a role on this project can record a lesson learned.");
  }

  await db.$transaction([
    db.lessonLearned.create({
      data: { gateId, type: type as "WENT_WELL" | "TO_IMPROVE", text, recordedById: actorId },
    }),
    db.auditLogEntry.create({
      data: { actorId, action: "lesson.recorded", gateId, entityType: "Gate", entityId: gateId },
    }),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
  revalidatePath("/lessons-learned");
}

// ── Portfolio view — scheduled reports ──────────────────────────────
// Sends for real via Resend on the configured day (see
// src/instrumentation.ts for the cron, src/lib/scheduledReportSender.ts
// for the actual send). createScheduledReport/deleteScheduledReport
// only manage the label/day/recipients config; sendScheduledReportNow
// below triggers an immediate out-of-schedule send for testing.

export async function createScheduledReport(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const dayOfWeekRaw = String(formData.get("dayOfWeek") ?? "");
  const dayOfWeek = Number(dayOfWeekRaw);
  const recipientUserIds = formData.getAll("recipientUserIds").map(String);

  if (!label) throw new Error("A label is required.");
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error("A valid day of the week is required.");
  }
  if (recipientUserIds.length === 0) throw new Error("At least one recipient is required.");

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const globalRoleKeys = await getCurrentUserGlobalRoleKeys();
  if (!canManageScheduledReports(globalRoleKeys)) {
    throw new Error("Only an SRO, Compliance Officer, or Client Authority can set up scheduled reports.");
  }

  await db.scheduledReport.create({
    data: { label, dayOfWeek, recipientUserIds, createdById: actorId },
  });

  revalidatePath("/");
}

export async function deleteScheduledReport(id: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const globalRoleKeys = await getCurrentUserGlobalRoleKeys();
  if (!canManageScheduledReports(globalRoleKeys)) {
    throw new Error("Only an SRO, Compliance Officer, or Client Authority can remove a scheduled report.");
  }

  await db.scheduledReport.delete({ where: { id } });
  revalidatePath("/");
}

export async function sendScheduledReportNow(id: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const globalRoleKeys = await getCurrentUserGlobalRoleKeys();
  if (!canManageScheduledReports(globalRoleKeys)) {
    throw new Error("Only an SRO, Compliance Officer, or Client Authority can send a scheduled report.");
  }

  const result = await sendScheduledReport(id);
  if (!result.sent) {
    throw new Error(`Send failed: ${result.reason ?? "unknown reason"}`);
  }

  revalidatePath("/");
}

// ── Project ──────────────────────────────────────────────────────────

/**
 * Platform-admin-only, irreversible (confirmed 20 Aug 2026:
 * "only admin access is able to delete projects"). No cascade at the
 * schema level — every dependent row (deliverables, evidence,
 * compliance, spend, sign-offs, lessons learned, ...) is deleted
 * explicitly, in dependency order, inside one transaction, rather than
 * relying on onDelete: Cascade — keeps deletion fully visible in
 * application code instead of implicit in the schema. AuditLogEntry
 * rows are the one exception: entityId is a free-text reference, not a
 * real foreign key, so the "project.deleted" entry below survives the
 * project it describes, same as intended for an audit trail.
 *
 * Requires typing the project number back, the same "can't happen by
 * a stray click" rail as GitHub-style destructive confirmations —
 * there's no real password-gated auth in this scaffold to re-prompt
 * for instead.
 */
export async function deleteProject(
  projectId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const confirmProjectNumber = String(formData.get("confirmProjectNumber") ?? "").trim();

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can delete a project.");
  }

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (confirmProjectNumber !== project.projectNumber) {
    // A typo here is an everyday mistake, not an exceptional failure —
    // return it as form state (caught by useActionState in
    // DeleteProjectForm) rather than throwing, so the user sees an
    // inline warning instead of Next's generic error boundary.
    return { error: "You have entered the wrong number." };
  }

  await db.$transaction([
    db.evidenceFile.deleteMany({ where: { deliverable: { gate: { stage: { projectId } } } } }),
    db.deliverableBypass.deleteMany({ where: { deliverable: { gate: { stage: { projectId } } } } }),
    db.deliverable.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.complianceEvidenceFile.deleteMany({ where: { complianceRequirement: { gate: { stage: { projectId } } } } }),
    db.complianceCoSignOff.deleteMany({ where: { complianceRequirement: { gate: { stage: { projectId } } } } }),
    db.complianceRequirement.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.complianceOverride.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.spendApproval.deleteMany({ where: { spendRecord: { gate: { stage: { projectId } } } } }),
    db.spendInvoiceFile.deleteMany({ where: { spendRecord: { gate: { stage: { projectId } } } } }),
    db.spendRecord.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.gateSignOff.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.lessonLearned.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.auditLogEntry.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.gate.deleteMany({ where: { stage: { projectId } } }),
    db.stage.deleteMany({ where: { projectId } }),
    db.projectRoleAssignment.deleteMany({ where: { projectId } }),
    db.resourceAllocation.deleteMany({ where: { projectId } }),
    db.provisioningReview.deleteMany({ where: { projectId } }),
    db.projectAdditionalTemplate.deleteMany({ where: { projectId } }),
    db.project.delete({ where: { id: projectId } }),
    db.auditLogEntry.create({
      data: {
        actorId,
        action: "project.deleted",
        entityType: "Project",
        entityId: projectId,
        reason: `Project #${project.projectNumber} "${project.name}" deleted`,
      },
    }),
  ]);

  revalidatePath("/");
  redirect("/");
}

// ── Team ─────────────────────────────────────────────────────────────

/**
 * Platform-admin-only. A Department always belongs to an existing
 * Company (FM Contractor or Client Authority) — there was previously
 * no way to add one short of hand-editing prisma/seed.ts, which meant
 * a genuinely new person (e.g. a new starter on an existing company's
 * team) had nowhere to go if their department wasn't already seeded.
 */
export async function createDepartment(formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can add a department.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const companyId = String(formData.get("companyId") ?? "").trim();
  if (!name || !companyId) {
    throw new Error("A name and a company are both required.");
  }

  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const existing = await db.department.findFirst({ where: { name, companyId } });
  if (existing) {
    throw new Error(`${company.name} already has a department called "${name}".`);
  }

  const created = await db.department.create({ data: { name, companyId } });
  await db.auditLogEntry.create({
    data: { actorId, action: "department.created", entityType: "Department", entityId: created.id },
  });

  revalidatePath("/team");
}

/**
 * Platform-admin-only, same as deleteProject. Creates a new person —
 * on its own they hold no role anywhere; assignUserToProject below is
 * what actually lets them act as PM/SRO/etc. on a project.
 */
export async function createUser(formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can add a person.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const homeDepartmentId = String(formData.get("homeDepartmentId") ?? "").trim();
  if (!name || !email || !homeDepartmentId) {
    throw new Error("Name, email, and department are all required.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`A person with the email ${email} already exists.`);
  }

  const created = await db.user.create({ data: { name, email, homeDepartmentId } });
  await db.auditLogEntry.create({
    data: { actorId, action: "user.created", entityType: "User", entityId: created.id },
  });

  revalidatePath("/team");
  revalidatePath("/");
}

/**
 * Renames a person / updates their email in place — this rewrites how
 * their PAST actions display too (audit entries, evidence uploads,
 * sign-offs all join live to User.name). Right for a typo or contact
 * update; wrong for "this person left and someone else took the role"
 * — that case wants a new person (createUser) plus reassigning their
 * ProjectRoleAssignment rows instead, so history stays attributed to
 * whoever actually did it.
 */
export async function updateUser(userId: string, formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can edit a person.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  // Optional -- someone can be created/left without a department yet
  // (see createUser's own homeDepartmentId requirement, which this
  // predates) and this is the only place to fix that after the fact,
  // so an empty selection here has to mean "clear it", not "no change".
  const homeDepartmentId = String(formData.get("homeDepartmentId") ?? "").trim() || null;
  if (!name || !email) {
    throw new Error("Name and email are both required.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.id !== userId) {
    throw new Error(`A person with the email ${email} already exists.`);
  }

  await db.user.update({ where: { id: userId }, data: { name, email, homeDepartmentId } });
  await db.auditLogEntry.create({
    data: { actorId, action: "user.updated", entityType: "User", entityId: userId },
  });

  revalidatePath("/team");
  revalidatePath("/");
}

/**
 * Marks a person as having left the company (26 Aug 2026, "totally
 * remove a name/contact from the view"). Deliberately not a delete —
 * see User.archivedAt's schema comment for why: their name has to keep
 * meaning something on every past evidence upload, sign-off and audit
 * entry. This just blocks future sign-in (auth.ts) and drops them out
 * of active rosters/pickers everywhere else. Existing
 * ProjectRoleAssignment rows are left alone (a PM can still remove one
 * explicitly via removeRoleAssignment if they want it off an active
 * project's team list too) — archiving is a company-wide fact about
 * the person, not a statement about which projects they were on.
 */
export async function archiveUser(userId: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can archive a person.");
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { archivedAt: new Date() } });
  await db.auditLogEntry.create({
    data: { actorId, action: "user.archived", entityType: "User", entityId: userId, reason: `${user.name} marked as left the company` },
  });

  // "layout", not just the page -- the admin "view as" switcher lives
  // in the root layout (src/app/layout.tsx) and reads archivedAt too,
  // so a plain revalidatePath("/") alone leaves it stale.
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

/** Reverses archiveUser — a rejoin, or an archived-by-mistake fix. */
export async function reactivateUser(userId: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can reactivate a person.");
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { archivedAt: null } });
  await db.auditLogEntry.create({
    data: { actorId, action: "user.reactivated", entityType: "User", entityId: userId, reason: `${user.name} reactivated` },
  });

  revalidatePath("/team");
  revalidatePath("/", "layout");
}

/**
 * Grants a person a role on a project — the mechanism that actually
 * lets them act as PM/SRO/etc. there. Same upsert shape as
 * assignStandardTeam (standardTeam.ts), just driven by a form instead
 * of the hardcoded standing-team list.
 */
export async function assignUserToProject(
  userId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can assign someone to a project.");
  }

  const projectId = String(formData.get("projectId") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!projectId || !roleId) {
    return { error: "A project and a role are both required." };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.homeDepartmentId) {
    return { error: `${user.name} has no home department set, so can't be assigned to a project.` };
  }

  // Both looked up explicitly (rather than letting a stale id fall
  // through to the transaction's own foreign-key check) so a role or
  // project deleted since this page loaded — e.g. the dropdown still
  // holding an option for a role just deleted in another tab — comes
  // back as a plain, readable error instead of an uncaught Prisma
  // exception (which Next only ever shows as a generic minified error).
  const [project, role] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.role.findUnique({ where: { id: roleId } }),
  ]);
  if (!project) return { error: "That project no longer exists — refresh the page and try again." };
  if (!role) return { error: "That role no longer exists — refresh the page and pick another." };

  await db.$transaction([
    db.projectRoleAssignment.upsert({
      where: { projectId_userId_roleId: { projectId, userId, roleId } },
      update: {},
      create: { projectId, userId, roleId, departmentId: user.homeDepartmentId },
    }),
    db.auditLogEntry.create({
      data: { actorId, action: "user.assigned_to_project", entityType: "ProjectRoleAssignment", entityId: userId },
    }),
  ]);

  // "layout" too -- gaining their first role assignment is exactly
  // what makes someone newly eligible for the admin "view as" switcher
  // (src/app/layout.tsx's own filter), which lives outside this route.
  revalidatePath("/team");
  revalidatePath("/", "layout");
  revalidatePath(`/projects/${project.projectNumber}`);
  return {};
}

/**
 * Platform-admin-only. Creates a brand-new Role — the thing that
 * makes "add a resource like Head of Estates, then use it as a
 * sign-off or override authority" possible without a code change
 * (23 Aug 2026, "fully dynamic authority roles"). The key is derived
 * from the name (UPPER_SNAKE_CASE, matching every existing role —
 * "Head of Estates" -> HEAD_OF_ESTATES) rather than typed separately,
 * since a mistyped key is invisible until something silently fails to
 * match it later. isExactMatchAuthority decides, once, whether SRO can
 * act through this role (false — the ordinary case, like Compliance
 * Officer) or whether it's a genuinely distinct authority SRO has no
 * standing over (true — like Fire Officer); see Role.isExactMatchAuthority
 * in schema.prisma for the full reasoning.
 */
export async function createRole(formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can add a role.");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("A name is required.");
  const key = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) throw new Error("That name doesn't produce a usable role key — try adding a letter or number.");

  const existing = await db.role.findUnique({ where: { key } });
  if (existing) {
    throw new Error(`A role called "${existing.name}" already exists (key ${key}).`);
  }

  const isExactMatchAuthority = formData.get("isExactMatchAuthority") === "on";

  const categoryInput = String(formData.get("category") ?? "");
  const category = (Object.values(RoleCategory) as string[]).includes(categoryInput)
    ? (categoryInput as RoleCategory)
    : RoleCategory.PROJECT_TEAM;

  const created = await db.role.create({ data: { key, name, isExactMatchAuthority, category } });
  await db.auditLogEntry.create({
    data: { actorId, action: "role.created", entityType: "Role", entityId: created.id },
  });

  revalidatePath("/", "layout");
}

/**
 * Platform-admin-only, for undoing an "Add role" mistake before it's
 * actually in use. bypassAuthority/overrideAuthority and additional
 * approver lists are open Role.key strings, not foreign keys (23 Aug
 * 2026, "fully dynamic authority roles"), and every place that
 * displays one already falls back to the raw key if no Role matches
 * (see roleLabelByKey lookups in GateDetail.tsx) — so deleting a Role
 * row can't corrupt those. The one real foreign key is
 * ProjectRoleAssignment, which is why this blocks outright rather than
 * cascading: a role someone is actually assigned to isn't a mistake to
 * silently unwind.
 */
export async function deleteRole(roleId: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can delete a role.");
  }

  const role = await db.role.findUniqueOrThrow({ where: { id: roleId } });
  const assignmentCount = await db.projectRoleAssignment.count({ where: { roleId } });
  if (assignmentCount > 0) {
    throw new Error(
      `"${role.name}" is assigned to ${assignmentCount} project role assignment${assignmentCount === 1 ? "" : "s"} — remove those first.`
    );
  }

  await db.$transaction([
    db.role.delete({ where: { id: roleId } }),
    db.auditLogEntry.create({
      data: { actorId, action: "role.deleted", entityType: "Role", entityId: roleId, reason: `Role "${role.name}" (${role.key}) deleted` },
    }),
  ]);

  revalidatePath("/", "layout");
}

// ── Share links ──────────────────────────────────────────────────────
// Read-only, expiring, revocable demo access -- see shareLinks.ts and
// ShareLink's schema comment for the full design. Platform-admin-only to
// create/revoke, same gate as createUser/createRole above.

const SHARE_LINK_MAX_HOURS = 24 * 30; // 30 days -- a demo link, not a permanent public one

export async function createShareLink(formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can create a share link.");
  }

  const label = String(formData.get("label") ?? "").trim() || null;
  const hours = Number(formData.get("expiresInHours"));
  if (!Number.isFinite(hours) || hours <= 0 || hours > SHARE_LINK_MAX_HOURS) {
    throw new Error(`expiresInHours must be between 1 and ${SHARE_LINK_MAX_HOURS}.`);
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const created = await db.shareLink.create({
    data: {
      token,
      label,
      createdById: actorId,
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
    },
  });
  await db.auditLogEntry.create({
    data: { actorId, action: "shareLink.created", entityType: "ShareLink", entityId: created.id },
  });

  revalidatePath("/share-links");
}

export async function revokeShareLink(shareLinkId: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can revoke a share link.");
  }

  await db.shareLink.update({ where: { id: shareLinkId }, data: { revokedAt: new Date() } });
  await db.auditLogEntry.create({
    data: { actorId, action: "shareLink.revoked", entityType: "ShareLink", entityId: shareLinkId },
  });

  revalidatePath("/share-links");
}

/** Leaves a demo view -- no permission check needed, same shape as clearViewAsUser: it only ever clears a cookie. */
export async function exitShareLinkView() {
  const store = await cookies();
  store.delete(SHARE_LINK_COOKIE_NAME);
  redirect("/login");
}

// ── Access requests ─────────────────────────────────────────────────

/**
 * Clears a logged rejected sign-in attempt from /access-requests --
 * purely a "seen it, don't want them added" dismissal, not a security
 * action: it doesn't block or allow anything by itself (that's still
 * entirely governed by whether a User row exists, per auth.ts's signIn
 * callback). If the same email tries again after being dismissed, it
 * just gets re-logged fresh.
 */
export async function dismissAccessRequest(id: string) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can dismiss an access request.");
  }

  await db.rejectedSignInAttempt.delete({ where: { id } });

  revalidatePath("/access-requests");
  revalidatePath("/", "layout");
}

// ── Compliance rule approvals ───────────────────────────────────────

/**
 * Platform-admin-only, same reasoning as the Team page: a
 * ComplianceRuleTemplate is a global/platform entity with no natural
 * per-project owner, so this doesn't fit a project-scoped role check.
 * Changes the rule template's approval configuration — who can
 * override it, and which other role(s) must independently co-sign
 * (see permissions.ts#isComplianceRequirementClear). Since
 * ComplianceRequirement is a frozen copy taken at instantiation (same
 * as Deliverable), editing the template alone only affects *future*
 * instantiations — applyToExisting additionally pushes the same two
 * fields onto every already-instantiated requirement for this rule,
 * the same one-off pattern used to retrofit the HAI-SCRIBE worked
 * example onto live demo data.
 */
export async function updateComplianceRuleApprovals(templateId: string, formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can change compliance rule approvals.");
  }

  const validRoleKeys = new Set((await db.role.findMany({ select: { key: true } })).map((r) => r.key));

  const overrideAuthority = String(formData.get("overrideAuthority") ?? "").trim();
  if (!validRoleKeys.has(overrideAuthority)) {
    throw new Error(`Unknown override authority: ${overrideAuthority}.`);
  }

  const additionalApproverRoleKeys = formData.getAll("additionalApproverRoleKeys").map(String);
  const invalidKeys = additionalApproverRoleKeys.filter((k) => !validRoleKeys.has(k));
  if (invalidKeys.length > 0) {
    throw new Error(`Unknown role key(s): ${invalidKeys.join(", ")}.`);
  }

  const applyToExisting = formData.get("applyToExisting") === "on";

  const data = { overrideAuthority, additionalApproverRoleKeys };

  await db.$transaction([
    db.complianceRuleTemplate.update({ where: { id: templateId }, data }),
    ...(applyToExisting ? [db.complianceRequirement.updateMany({ where: { templateId }, data })] : []),
    db.auditLogEntry.create({
      data: {
        actorId,
        action: "compliance_rule.approvals_updated",
        entityType: "ComplianceRuleTemplate",
        entityId: templateId,
        reason: applyToExisting ? "Applied to existing live requirements too" : "Template only",
      },
    }),
  ]);

  revalidatePath("/", "layout");
}
