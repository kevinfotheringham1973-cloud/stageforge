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
import { canBypassDeliverable, canDecideGate, canOverrideCompliance, isGateReadyForSponsor } from "./permissions";
import { instantiateStage } from "./instantiation";
import { matchProject } from "./provisioning";

export async function setActingUser(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, userId, { path: "/" });
  revalidatePath("/", "layout");
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
    // A gate starts NOT_STARTED; the first thing anyone does on one of
    // its deliverables is what actually starts it. Nothing else in the
    // model ever makes this transition — without it a gate created
    // NOT_STARTED (every reinstated stage, every seeded future gate)
    // could accumulate evidence forever but never reach a Submit button.
    ...(gate.status === "NOT_STARTED"
      ? [db.gate.update({ where: { id: gateId }, data: { status: "IN_PROGRESS" as const } })]
      : []),
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
    // See the same note in recordEvidenceStub — a bypass also starts a
    // NOT_STARTED gate.
    ...(gate.status === "NOT_STARTED"
      ? [db.gate.update({ where: { id: gateId }, data: { status: "IN_PROGRESS" as const } })]
      : []),
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
    ...(gate.status === "NOT_STARTED"
      ? [db.gate.update({ where: { id: gateId }, data: { status: "IN_PROGRESS" as const } })]
      : []),
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
    ...(gate.status === "NOT_STARTED"
      ? [db.gate.update({ where: { id: gateId }, data: { status: "IN_PROGRESS" as const } })]
      : []),
  ]);

  revalidatePath(`/projects/${projectNumber}`);
  revalidatePath(`/projects/${projectNumber}/gates/${gateId}`);
}

export async function submitForApproval(gateId: string, projectNumber: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: { stage: true, deliverables: true, complianceRequirements: true },
  });

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager submits a gate for Sponsor approval.");
  }
  if (!isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements)) {
    throw new Error(
      "Every deliverable must be evidenced or bypassed, and every compliance requirement evidenced or overridden, before this gate can be submitted."
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
    include: { stage: true, deliverables: true, complianceRequirements: true },
  });

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!canDecideGate(roleKeys)) {
    throw new Error("Only the Project Sponsor can approve or reject a gate.");
  }
  if (gate.status !== "AWAITING_SPONSOR") {
    throw new Error("This gate hasn't been submitted for approval yet.");
  }
  if (decision === "APPROVED" && !isGateReadyForSponsor(gate.deliverables, gate.complianceRequirements)) {
    throw new Error("This gate still has outstanding deliverables or compliance requirements — it isn't ready for approval.");
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
      data: { status: decision === "APPROVED" ? "SIGNED_OFF" : "IN_PROGRESS" },
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
    select: { tags: true },
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
    projectTags: project.tags,
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
 * yet. The creator becomes PM immediately (§05 open question on the
 * rest of role assignment is not solved here).
 */
export async function createProvisioningDraft(formData: FormData) {
  const projectNumber = String(formData.get("projectNumber") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  if (!projectNumber || !name || !brief) {
    throw new Error("Project number, name, and description are all required.");
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const match = await matchProject(db, brief);

  const template = await db.template.findUniqueOrThrow({
    where: { id: match.templateId },
    include: { stageTemplates: { orderBy: { order: "asc" } } },
  });

  const creator = await db.user.findUniqueOrThrow({ where: { id: userId } });

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
      status: "DRAFT",
      createdById: userId,
      provisioningBrief: brief,
      provisioningMatchReasoning: match.reasoning,
    },
  });

  if (creator.homeDepartmentId) {
    const pmRole = await db.role.findUniqueOrThrow({ where: { key: "PM" } });
    await db.projectRoleAssignment.create({
      data: { projectId: project.id, departmentId: creator.homeDepartmentId, userId, roleId: pmRole.id },
    });
  }

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
    data: { templateId: templateId || project.templateId, tags },
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
      projectTags: project.tags,
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
