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
import { matchProject } from "./provisioning";
import { effectiveComplianceTags, isCdmWorksType } from "./cdm";
import { issueNextProjectNumber } from "./projectNumber";
import { assignStandardTeam } from "./standardTeam";

export async function setActingUser(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, userId, { path: "/" });
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
 * Records evidence against a deliverable — the first upload, or a
 * replacement before sign-off (DataModel.html: "version history when
 * a file is replaced before sign-off"). Real evidence storage is out
 * of scope for this scaffold — this records a file NAME, not an
 * actual upload. "Who can upload" beyond "PM, or whoever has this
 * item's bypass authority" isn't pinned down in the PRD yet.
 */
export async function recordEvidenceStub(
  deliverableId: string,
  projectNumber: string,
  gateId: string,
  formData: FormData
) {
  const fileName = String(formData.get("fileName") ?? "").trim();
  if (!fileName) throw new Error("A file name is required.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({ where: { id: gateId } });
  if (gate.status === "SIGNED_OFF") {
    throw new Error("This gate is already signed off — evidence can't be replaced after the fact.");
  }

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
        fileRef: `local://dev-upload/${fileName}`,
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
  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);

  if (!canBypassDeliverable(roleKeys, deliverable.bypassAuthority)) {
    throw new Error(
      `This deliverable requires ${deliverable.bypassAuthority} authority to bypass — your current roles on this project don't qualify.`
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
 * recordEvidenceStub exactly (same dev-stub caveat: records a file
 * name, not an actual upload). A requirement clears normally with
 * evidence, independently of every other requirement on the gate —
 * the all-at-once clearing mechanic belongs to overrideCompliance
 * below, not this.
 */
export async function recordComplianceEvidenceStub(
  complianceRequirementId: string,
  projectNumber: string,
  gateId: string,
  formData: FormData
) {
  const fileName = String(formData.get("fileName") ?? "").trim();
  if (!fileName) throw new Error("A file name is required.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({ where: { id: gateId } });
  if (gate.status === "SIGNED_OFF") {
    throw new Error("This gate is already signed off — evidence can't be replaced after the fact.");
  }

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
        fileRef: `local://dev-upload/${fileName}`,
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

  if (!canOverrideCompliance(roleKeys)) {
    throw new Error("Overriding compliance requirements requires SRO authority.");
  }

  const outstanding = gate.complianceRequirements.filter((c) => c.blocksGate && c.status === "PENDING");
  if (outstanding.length === 0) {
    throw new Error("There are no outstanding compliance requirements on this gate to override.");
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
 * revised: spend is checked and approved at each gate). Finance-only,
 * same "domain owner enters" split as Compliance. Starts PENDING —
 * blocks the gate (isGateReadyForSponsor) until a Sponsor/SRO approves
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
    throw new Error("Recording spend requires the Finance role.");
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
    throw new Error("Approving spend requires Sponsor or SRO authority.");
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
}

export async function approveSpend(spendRecordId: string, projectNumber: string, gateId: string) {
  await decideSpend(spendRecordId, projectNumber, gateId, "APPROVED", null);
}

export async function rejectSpend(spendRecordId: string, projectNumber: string, gateId: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  await decideSpend(spendRecordId, projectNumber, gateId, "REJECTED", reason);
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
 * project's scope. Confirmed by Kevin: it appends after the
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
    projectTags: effectiveComplianceTags(project),
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
  const worksType = String(formData.get("worksType") ?? "");
  if (!name || !brief) {
    throw new Error("Project name and description are both required.");
  }
  if (!isCdmWorksType(worksType)) {
    throw new Error(
      "The CDM 2015 works-type question is required: single-contractor direct replacement, multiple-contractor direct replacement, or building modification?"
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const match = await matchProject(db, brief);

  const template = await db.template.findUniqueOrThrow({
    where: { id: match.templateId },
    include: { stageTemplates: { orderBy: { order: "asc" } } },
  });

  const projectNumber = await issueNextProjectNumber();

  const project = await db.project.create({
    data: {
      projectNumber,
      name,
      templateId: template.id,
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

  redirect(`/projects/${projectNumber}/provisioning`);
}

/**
 * The drafting PM edits the brief after a REVISE decision; re-runs the
 * match; overwrites the proposed template/tags/reasoning on the same
 * Project row — no new project number.
 */
export async function reviseProvisioningBrief(projectId: string, projectNumber: string, formData: FormData) {
  const brief = String(formData.get("brief") ?? "").trim();
  if (!brief) throw new Error("A description is required.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status !== "DRAFT") throw new Error("This project is no longer a draft.");
  if (project.createdById !== userId) {
    throw new Error("Only the project's creator can revise the description.");
  }

  const match = await matchProject(db, brief);

  await db.project.update({
    where: { id: projectId },
    data: {
      provisioningBrief: brief,
      provisioningMatchReasoning: match.reasoning,
      templateId: match.templateId,
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
      projectTags: effectiveComplianceTags(project),
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
// Configuration only (label, day, recipients) — there is no email/
// notification infrastructure in this scaffold to actually deliver
// through. See the ScheduledReport model comment in schema.prisma.

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

// ── Project ──────────────────────────────────────────────────────────

/**
 * PM-only, same authority tier as setResourceAllocation/setGateTimeline
 * — correcting a typo or renaming a project is planning-adjacent
 * admin, not a governance decision requiring sign-off.
 */
export async function renameProject(projectId: string, projectNumber: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("A project name is required.");

  const actorId = await getCurrentUserId();
  if (!actorId) throw new Error("Not signed in.");

  const roleKeys = await getCurrentUserRoleKeysForProject(projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager can rename this project.");
  }

  await db.$transaction([
    db.project.update({ where: { id: projectId }, data: { name } }),
    db.auditLogEntry.create({
      data: { actorId, action: "project.renamed", entityType: "Project", entityId: projectId },
    }),
  ]);

  revalidatePath("/");
  revalidatePath(`/projects/${projectNumber}`);
}
