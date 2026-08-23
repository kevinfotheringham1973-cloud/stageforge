"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import {
  getCurrentUserGlobalRoleKeys,
  getCurrentUserId,
  getCurrentUserRoleKeysForProject,
  SESSION_COOKIE_NAME,
} from "./session";
import {
  BYPASS_AUTHORITY_LABEL,
  canApproveSpend,
  canBypassDeliverable,
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
import { resolveWorksPackageId } from "./worksPackages";
import { sendScheduledReport } from "./scheduledReportSender";
import { evidenceFolderPath, isSharePointConfigured, uploadEvidenceFile } from "./sharepoint";

export async function setActingUser(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, userId, {
    path: "/",
    httpOnly: true, // nothing client-side ever needs to read this — server-only via next/headers
    sameSite: "lax", // top-level nav (clicking a link) still sends it; cross-site form/fetch POSTs don't
    secure: process.env.NODE_ENV === "production", // the tunnel's public URL is HTTPS-only; local dev stays plain HTTP
  });
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
 * Reads the uploaded File from the form and resolves where it actually
 * lives: uploaded to the configured SharePoint site (real fileRef =
 * the Graph webUrl) when the AZURE_ and SHAREPOINT_ env vars are set, or the
 * pre-existing local dev stub otherwise. Same fallback either way keeps
 * the demo usable with zero setup, while flipping on for real the
 * moment credentials + a real site are in place — no other code change
 * needed.
 */
async function resolveEvidenceUpload(
  formData: FormData,
  project: { name: string; projectNumber: string },
  stageName: string
): Promise<{ fileName: string; fileRef: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A file is required.");
  }

  if (isSharePointConfigured()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const folderPath = evidenceFolderPath(project, stageName);
    const uploaded = await uploadEvidenceFile(folderPath, file.name, buffer);
    return { fileName: file.name, fileRef: uploaded.webUrl };
  }

  return { fileName: file.name, fileRef: `local://dev-upload/${file.name}` };
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

  const { fileName, fileRef } = await resolveEvidenceUpload(formData, gate.stage.project, gate.stage.name);

  const existingFiles = await db.evidenceFile.findMany({
    where: { deliverableId },
    orderBy: { version: "desc" },
    take: 1,
  });
  const nextVersion = (existingFiles[0]?.version ?? 0) + 1;
  const isReplacement = existingFiles.length > 0;

  await db.$transaction([
    db.evidenceFile.create({
      data: {
        deliverableId,
        fileName,
        fileRef,
        version: nextVersion,
        uploadedById: userId,
      },
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
  const [roleKeys, globalRoleKeys] = await Promise.all([
    getCurrentUserRoleKeysForProject(gate.stage.projectId),
    getCurrentUserGlobalRoleKeys(),
  ]);

  if (!canBypassDeliverable(roleKeys, deliverable.bypassAuthority, globalRoleKeys)) {
    throw new Error(
      `This deliverable requires ${BYPASS_AUTHORITY_LABEL[deliverable.bypassAuthority]} authority to bypass — your current roles on this project don't qualify.`
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
  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);

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
  const missingAuthorities = requiredAuthorities.filter((auth) => !canOverrideCompliance(roleKeys, auth));
  if (missingAuthorities.length > 0) {
    throw new Error(
      `Overriding every outstanding item on this gate at once requires ${missingAuthorities.map((a) => BYPASS_AUTHORITY_LABEL[a]).join(" and ")} authority — you're missing ${missingAuthorities.length > 1 ? "these" : "this"}.`
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
    include: { gate: { include: { stage: true } } },
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
    include: { stage: true, deliverables: true, complianceRequirements: true, spendRecords: true },
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
    include: { stage: true, deliverables: true, complianceRequirements: true, spendRecords: true },
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
  stageTemplateId: string,
  projectNumber: string
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserRoleKeysForProject(projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager can reinstate a stage.");
  }

  const stageTemplate = await db.stageTemplate.findUniqueOrThrow({
    where: { id: stageTemplateId },
    include: { gateTemplate: { include: { deliverableTemplates: true } }, template: true },
  });
  if (!stageTemplate.gateTemplate) {
    throw new Error("This stage template has no gate template — nothing to reinstate.");
  }

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { tags: true, worksType: true },
  });

  const alreadyInstantiated = await db.stage.findFirst({
    where: { projectId, key: stageTemplate.key },
  });
  if (alreadyInstantiated) {
    throw new Error("This stage is already part of the project.");
  }

  const { _max } = await db.stage.aggregate({ where: { projectId }, _max: { order: true } });
  const nextOrder = (_max.order ?? -1) + 1;

  const { stage } = await instantiateStage(db, {
    projectId,
    projectTags: effectiveComplianceTags(project, stageTemplate.template.key),
    sectorVariantId: stageTemplate.template.sectorVariantId,
    order: nextOrder,
    stageTemplate,
  });

  await db.project.update({
    where: { id: projectId },
    data: { includedStageKeys: { push: stageTemplate.key } },
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
  // "There are times when multiple systems are required" (21 Aug
  // 2026) — the works-package box doubles as a bundler: any additional
  // systems checked there become sibling DRAFT projects in the same
  // package as this one, created in the same submission. Each still
  // goes through its own Compliance Officer review before going live —
  // this only replaces re-filling the form once per system.
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

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  // Works Package (21 Aug 2026): a hospital runs 24/7, so extra
  // opportunistic work often bundles into the same disruption window as
  // the project that triggered it — a purely organisational link between
  // otherwise-independent, discipline-pure Projects, never a merge of
  // their checklists. Optional for a solo project; mandatory the moment
  // additional systems are being bundled in, since that's what links
  // them — auto-named after this project (22 Aug 2026) so
  // bundling never depends on the PM having typed a package name.
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

  const projectNumber = await issueNextProjectNumber();

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
      status: "DRAFT",
      createdById: userId,
      provisioningBrief: brief,
      provisioningMatchReasoning: match.reasoning,
    },
  });

  // The standing hospital team (lib/standardTeam.ts), not just the
  // creator as PM — a project no longer starts with every other role
  // (Sponsor, SRO, Compliance Officer, Finance, ...) simply missing
  // until someone notices and fills it in by hand.
  await assignStandardTeam(project.id);

  await db.auditLogEntry.create({
    data: { actorId: userId, action: "project.provisioning_drafted", entityType: "Project", entityId: project.id },
  });

  for (const extraTemplateId of additionalTemplateIds) {
    const extraTemplate = await db.template.findUniqueOrThrow({
      where: { id: extraTemplateId },
      include: { stageTemplates: { orderBy: { order: "asc" } } },
    });
    const extraMatch = await matchComplianceTags(db, extraTemplateId, brief);
    const extraProjectNumber = await issueNextProjectNumber();

    const extraProject = await db.project.create({
      data: {
        projectNumber: extraProjectNumber,
        name: `${resolvedWorksPackage!.name} — ${extraTemplate.name}`,
        templateId: extraTemplate.id,
        worksPackageId: resolvedWorksPackage!.id,
        includedStageKeys: extraTemplate.stageTemplates.map((st) => st.key),
        tags: extraMatch.tags,
        worksType,
        status: "DRAFT",
        createdById: userId,
        provisioningBrief: brief,
        provisioningMatchReasoning: extraMatch.reasoning,
      },
    });

    await assignStandardTeam(extraProject.id);

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

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");
  if (project.createdById !== userId) {
    throw new Error("Only the project's creator can revise the description.");
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

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserGlobalRoleKeys();
  if (!roleKeys.includes("COMPLIANCE_OFFICER")) {
    throw new Error("Only a Compliance Officer can override a provisioning draft's proposed match.");
  }

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");

  await db.project.update({
    where: { id: projectId },
    data: { templateId: templateId || project.templateId, tags, worksType },
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
 * Instantiates every included Stage/Gate from the final templateId —
 * calls the same instantiateStage helper reinstateStage uses, not new
 * logic (ProvisioningModel.html §06) — and flips the Project to ACTIVE.
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
    include: {
      template: {
        include: {
          stageTemplates: {
            orderBy: { order: "asc" },
            include: { gateTemplate: { include: { deliverableTemplates: true } } },
          },
        },
      },
    },
  });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");

  await db.provisioningReview.create({
    data: { projectId, decision: "APPROVED", reviewedById: userId },
  });

  const includedStageKeys = new Set(project.includedStageKeys);
  let order = 0;
  for (const stageTemplate of project.template.stageTemplates) {
    if (!includedStageKeys.has(stageTemplate.key)) continue;
    await instantiateStage(db, {
      projectId,
      projectTags: effectiveComplianceTags(project, project.template.key),
      sectorVariantId: project.template.sectorVariantId,
      order,
      stageTemplate,
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
export async function deleteProject(projectId: string, formData: FormData) {
  const confirmProjectNumber = String(formData.get("confirmProjectNumber") ?? "").trim();

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can delete a project.");
  }

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (confirmProjectNumber !== project.projectNumber) {
    throw new Error("Type the project number exactly to confirm deletion.");
  }

  await db.$transaction([
    db.evidenceFile.deleteMany({ where: { deliverable: { gate: { stage: { projectId } } } } }),
    db.deliverableBypass.deleteMany({ where: { deliverable: { gate: { stage: { projectId } } } } }),
    db.deliverable.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.complianceEvidenceFile.deleteMany({ where: { complianceRequirement: { gate: { stage: { projectId } } } } }),
    db.complianceRequirement.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.complianceOverride.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.spendApproval.deleteMany({ where: { spendRecord: { gate: { stage: { projectId } } } } }),
    db.spendRecord.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.gateSignOff.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.lessonLearned.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.auditLogEntry.deleteMany({ where: { gate: { stage: { projectId } } } }),
    db.gate.deleteMany({ where: { stage: { projectId } } }),
    db.stage.deleteMany({ where: { projectId } }),
    db.projectRoleAssignment.deleteMany({ where: { projectId } }),
    db.resourceAllocation.deleteMany({ where: { projectId } }),
    db.provisioningReview.deleteMany({ where: { projectId } }),
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
  if (!name || !email) {
    throw new Error("Name and email are both required.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.id !== userId) {
    throw new Error(`A person with the email ${email} already exists.`);
  }

  await db.user.update({ where: { id: userId }, data: { name, email } });
  await db.auditLogEntry.create({
    data: { actorId, action: "user.updated", entityType: "User", entityId: userId },
  });

  revalidatePath("/team");
  revalidatePath("/");
}

/**
 * Grants a person a role on a project — the mechanism that actually
 * lets them act as PM/SRO/etc. there. Same upsert shape as
 * assignStandardTeam (standardTeam.ts), just driven by a form instead
 * of the hardcoded standing-team list.
 */
export async function assignUserToProject(userId: string, formData: FormData) {
  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!actor.isPlatformAdmin) {
    throw new Error("Only a platform admin can assign someone to a project.");
  }

  const projectId = String(formData.get("projectId") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!projectId || !roleId) {
    throw new Error("A project and a role are both required.");
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.homeDepartmentId) {
    throw new Error(`${user.name} has no home department set, so can't be assigned to a project.`);
  }

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

  revalidatePath("/team");
  revalidatePath(`/projects/${(await db.project.findUniqueOrThrow({ where: { id: projectId } })).projectNumber}`);
}
