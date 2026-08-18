"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getCurrentUserId, getCurrentUserRoleKeysForProject, SESSION_COOKIE_NAME } from "./session";
import { canBypassDeliverable, canDecideGate, isGateReadyForSponsor } from "./permissions";

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

export async function submitForApproval(gateId: string, projectNumber: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in.");

  const gate = await db.gate.findUniqueOrThrow({
    where: { id: gateId },
    include: { stage: true, deliverables: true },
  });

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!roleKeys.includes("PM")) {
    throw new Error("Only the Project Manager submits a gate for Sponsor approval.");
  }
  if (!isGateReadyForSponsor(gate.deliverables)) {
    throw new Error("Every deliverable must be evidenced or bypassed before this gate can be submitted.");
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
    include: { stage: true, deliverables: true },
  });

  const roleKeys = await getCurrentUserRoleKeysForProject(gate.stage.projectId);
  if (!canDecideGate(roleKeys)) {
    throw new Error("Only the Project Sponsor can approve or reject a gate.");
  }
  if (gate.status !== "AWAITING_SPONSOR") {
    throw new Error("This gate hasn't been submitted for approval yet.");
  }
  if (decision === "APPROVED" && !isGateReadyForSponsor(gate.deliverables)) {
    throw new Error("This gate still has outstanding deliverables — it isn't ready for approval.");
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
    include: { gateTemplate: { include: { deliverableTemplates: true } } },
  });
  if (!stageTemplate.gateTemplate) {
    throw new Error("This stage template has no gate template — nothing to reinstate.");
  }

  const alreadyInstantiated = await db.stage.findFirst({
    where: { projectId, key: stageTemplate.key },
  });
  if (alreadyInstantiated) {
    throw new Error("This stage is already part of the project.");
  }

  const { _max } = await db.stage.aggregate({ where: { projectId }, _max: { order: true } });
  const nextOrder = (_max.order ?? -1) + 1;

  const stage = await db.stage.create({
    data: {
      projectId,
      sourceStageTemplateId: stageTemplate.id,
      key: stageTemplate.key,
      name: stageTemplate.name,
      order: nextOrder,
    },
  });

  const gate = await db.gate.create({
    data: {
      stageId: stage.id,
      key: stageTemplate.gateTemplate.key,
      name: stageTemplate.gateTemplate.name,
      status: "NOT_STARTED",
    },
  });

  if (stageTemplate.gateTemplate.deliverableTemplates.length > 0) {
    await db.deliverable.createMany({
      data: stageTemplate.gateTemplate.deliverableTemplates.map((dt) => ({
        gateId: gate.id,
        templateId: dt.id,
        key: dt.key,
        label: dt.label,
        description: dt.description,
        minFiles: dt.minFiles,
        blocksGate: dt.blocksGate,
        bypassAuthority: dt.bypassAuthority,
        status: "PENDING" as const,
      })),
    });
  }

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
