// Permanent smoke test for the /api/email-approvals/* contract — the
// boundary between StageForge (this repo) and the sibling Group
// Discussion app's scripts/send-email-approvals.mjs, which hard-codes
// assumptions about the exact JSON shape these routes return. Run this
// after ANY change to the EmailApproval model or these routes, on
// either side of that boundary, before trusting the two systems still
// agree — see the "how do we keep them in sync" discussion in
// project_managed_system memory notes (2026-09-11) for why this exists.
//
// Calls the real route handler functions directly (no running server,
// no HTTP) against the real local dev database — same technique proven
// during Phase 2's own verification. Creates and cleans up its own
// throwaway test data; never touches anything else.
//
// Run: npx tsx scripts/smoke-test-email-approval-api.mts
// (from the app/ directory — needs DATABASE_URL and
// EMAIL_APPROVAL_API_TOKEN from .env, loaded via --env-file or dotenv)

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TOKEN = process.env.EMAIL_APPROVAL_API_TOKEN;

// The exact fields scripts/send-email-approvals.mjs (sibling repo)
// destructures from a /pending item — keep this list in sync with that
// file's approvalRequestHtmlBody()/sendApprovalRequestEmail() if either
// side's field usage changes. This IS the contract, made explicit and
// checked, rather than left as tribal knowledge in two separate repos.
const REQUIRED_PENDING_FIELDS: Array<{ path: string; get: (item: any) => unknown; type: string }> = [
  { path: "id", get: (i) => i.id, type: "string" },
  { path: "requestToken", get: (i) => i.requestToken, type: "string" },
  { path: "contact.name", get: (i) => i.contact?.name, type: "string" },
  { path: "contact.email", get: (i) => i.contact?.email, type: "string" },
  { path: "gateName", get: (i) => i.gateName, type: "string" },
  { path: "projectName", get: (i) => i.projectName, type: "string" },
  { path: "projectNumber", get: (i) => i.projectNumber, type: "string" },
  { path: "requestedByName", get: (i) => i.requestedByName, type: "string" },
];

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

async function main() {
  if (!TOKEN) {
    console.error("EMAIL_APPROVAL_API_TOKEN is not set — see .env.");
    process.exit(1);
  }

  const { GET } = await import("../src/app/api/email-approvals/pending/route.ts");
  const { POST } = await import("../src/app/api/email-approvals/[id]/sent/route.ts");
  const { POST: replyPOST } = await import("../src/app/api/email-approvals/[id]/reply/route.ts");
  const { GET: overdueGET } = await import("../src/app/api/email-approvals/overdue/route.ts");
  const { POST: remindedPOST } = await import("../src/app/api/email-approvals/[id]/reminded/route.ts");
  const { POST: escalatedPOST } = await import("../src/app/api/email-approvals/[id]/escalated/route.ts");
  const { REMINDER_INTERVAL_MS, MAX_REMINDERS_BEFORE_ESCALATION } = await import("../src/lib/emailApprovalEscalation.ts");
  // Phase 5's evidence storage follows the same real-SharePoint-vs-local-
  // vs-stub branching resolveEvidenceUploads() uses. This dev DB's
  // SharePoint env vars are present but blank (not actually provisioned),
  // so exercising the real byte-level round trip here means forcing the
  // local-disk branch on, in-process, for this script only — a genuinely
  // real storage backend (the Electron desktop build's own), not a mock.
  process.env.STAGEFORGE_LOCAL_MODE = "1";
  const { GET: docReviewPendingGET } = await import("../src/app/api/document-reviews/pending/route.ts");
  const { POST: docReviewStartedPOST } = await import("../src/app/api/document-reviews/[id]/started/route.ts");
  const { GET: docReviewEvidenceGET } = await import("../src/app/api/document-reviews/[id]/evidence/route.ts");
  const { POST: docReviewCompletePOST } = await import("../src/app/api/document-reviews/[id]/complete/route.ts");
  const { POST: docReviewFailedPOST } = await import("../src/app/api/document-reviews/[id]/failed/route.ts");
  const { localEvidenceFolderPath, saveLocalEvidenceFile, deleteLocalEvidenceFile } = await import("../src/lib/localEvidenceStorage.ts");

  console.log("Setting up real test data...");
  const pm = await db.user.findFirstOrThrow({ where: { email: "derek.g999@outlook.com" } });
  const project = await db.project.findFirstOrThrow({ where: { projectNumber: "20456" } });
  const gate = await db.gate.findFirstOrThrow({ where: { stage: { projectId: project.id } } });
  const contact = await db.projectContact.create({
    data: {
      projectId: project.id,
      name: "Smoke Test Contact",
      email: "smoke-test@example.invalid",
      createdById: pm.id,
    },
  });
  const ea = await db.emailApproval.create({ data: { gateId: gate.id, contactId: contact.id, requestedById: pm.id } });

  try {
    console.log("\n1. Auth rejection");
    check("GET no auth -> 401", (await GET(new Request("http://x/api/email-approvals/pending"))).status === 401);
    check(
      "GET wrong token -> 401",
      (await GET(new Request("http://x/api/email-approvals/pending", { headers: { authorization: "Bearer wrong" } })))
        .status === 401
    );

    console.log("\n2. /pending response shape (the real consumer contract)");
    const pendingRes = await GET(
      new Request("http://x/api/email-approvals/pending", { headers: { authorization: `Bearer ${TOKEN}` } })
    );
    check("GET correct token -> 200", pendingRes.status === 200);
    const body = await pendingRes.json();
    const item = body.pending?.find((p: any) => p.id === ea.id);
    check("Test item present in pending list", Boolean(item));
    for (const field of REQUIRED_PENDING_FIELDS) {
      const value = item ? field.get(item) : undefined;
      check(`pending[].${field.path} is a ${field.type}`, typeof value === field.type);
    }

    console.log("\n3. /sent transitions and guards");
    check(
      "POST sent wrong requestToken -> 404",
      (
        await POST(
          new Request(`http://x/api/email-approvals/${ea.id}/sent`, {
            method: "POST",
            headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ requestToken: "not-the-real-token" }),
          }),
          { params: Promise.resolve({ id: ea.id }) }
        )
      ).status === 404
    );
    const sentRes = await POST(
      new Request(`http://x/api/email-approvals/${ea.id}/sent`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ requestToken: ea.requestToken }),
      }),
      { params: Promise.resolve({ id: ea.id }) }
    );
    check("POST sent correct -> 200", sentRes.status === 200);
    const reloaded = await db.emailApproval.findUniqueOrThrow({ where: { id: ea.id } });
    check("Status now SENT with sentAt set", reloaded.status === "SENT" && reloaded.sentAt !== null);

    const pendingRes2 = await GET(
      new Request("http://x/api/email-approvals/pending", { headers: { authorization: `Bearer ${TOKEN}` } })
    );
    const body2 = await pendingRes2.json();
    check(
      "No longer in pending list",
      !body2.pending.some((p: any) => p.id === ea.id)
    );

    check(
      "POST sent again (already SENT) -> 409",
      (
        await POST(
          new Request(`http://x/api/email-approvals/${ea.id}/sent`, {
            method: "POST",
            headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ requestToken: reloaded.requestToken }),
          }),
          { params: Promise.resolve({ id: ea.id }) }
        )
      ).status === 409
    );
    console.log("\n4. Reply capture (Phase 3) — refusal paths, no synthetic gate needed");
    const ea2 = await db.emailApproval.create({ data: { gateId: gate.id, contactId: contact.id, requestedById: pm.id, status: "SENT" } });
    check(
      "Reply from non-Sponsor-role contact -> not recorded (contact_role_no_longer_qualifies)",
      (
        await (
          await replyPOST(
            new Request(`http://x/api/email-approvals/${ea2.id}/reply`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: ea2.requestToken, senderEmail: contact.email, decision: "APPROVED", replyExcerpt: "Approved" }),
            }),
            { params: Promise.resolve({ id: ea2.requestToken }) }
          )
        ).json()
      ).reason === "contact_role_no_longer_qualifies"
    );

    console.log("\n5. Reply capture — full happy path on a synthetic, isolated gate");
    const sponsorContact = await db.projectContact.create({
      data: { projectId: project.id, name: "Smoke Test Sponsor", email: "smoke-sponsor@example.invalid", roleKey: "SPONSOR", createdById: pm.id },
    });
    const stage = await db.stage.create({
      data: { projectId: project.id, key: `smoke_test_stage_${Date.now()}`, name: "Smoke Test Stage", order: 9999 },
    });
    const testGate = await db.gate.create({
      data: { stageId: stage.id, key: "smoke_test_gate", name: "Smoke Test Gate", status: "AWAITING_SPONSOR" },
    });
    const ea3 = await db.emailApproval.create({
      data: { gateId: testGate.id, contactId: sponsorContact.id, requestedById: pm.id, status: "SENT" },
    });

    check(
      "Sender mismatch -> not recorded",
      (
        await (
          await replyPOST(
            new Request(`http://x/api/email-approvals/${ea3.id}/reply`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: ea3.requestToken, senderEmail: "someone-else@example.invalid", decision: "APPROVED", replyExcerpt: "Approved" }),
            }),
            { params: Promise.resolve({ id: ea3.requestToken }) }
          )
        ).json()
      ).reason === "sender_mismatch"
    );
    check(
      "Ambiguous decision -> not recorded",
      (
        await (
          await replyPOST(
            new Request(`http://x/api/email-approvals/${ea3.id}/reply`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: ea3.requestToken, senderEmail: sponsorContact.email, decision: "AMBIGUOUS", replyExcerpt: "Let me check and get back to you" }),
            }),
            { params: Promise.resolve({ id: ea3.requestToken }) }
          )
        ).json()
      ).reason === "ambiguous"
    );
    const happyResult = await (
      await replyPOST(
        new Request(`http://x/api/email-approvals/${ea3.id}/reply`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: ea3.requestToken, senderEmail: sponsorContact.email, decision: "APPROVED", replyExcerpt: "Approved, looks good." }),
        }),
        { params: Promise.resolve({ id: ea3.requestToken }) }
      )
    ).json();
    check("Verified unambiguous APPROVED -> recorded: true", happyResult.recorded === true);

    const decidedEa = await db.emailApproval.findUniqueOrThrow({ where: { id: ea3.id } });
    check("EmailApproval status now DECIDED", decidedEa.status === "DECIDED");
    check("EmailApproval.verifiedSender set correctly", decidedEa.verifiedSender === sponsorContact.email.toLowerCase());

    const decidedGate = await db.gate.findUniqueOrThrow({ where: { id: testGate.id } });
    check("Gate status now SIGNED_OFF", decidedGate.status === "SIGNED_OFF");

    const resultingSignOff = await db.gateSignOff.findUnique({ where: { emailApprovalId: ea3.id } });
    check("A real GateSignOff was created", Boolean(resultingSignOff));
    check("capturedVia is EMAIL_PROXY", resultingSignOff?.capturedVia === "EMAIL_PROXY");
    check("GateSignOff.decision is APPROVED", resultingSignOff?.decision === "APPROVED");

    // A second reply after DECIDED must not create a duplicate sign-off.
    const secondReply = await (
      await replyPOST(
        new Request(`http://x/api/email-approvals/${ea3.id}/reply`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: ea3.requestToken, senderEmail: sponsorContact.email, decision: "REJECTED", replyExcerpt: "Actually no" }),
        }),
        { params: Promise.resolve({ id: ea3.requestToken }) }
      )
    ).json();
    check("Second reply after DECIDED -> not recorded", secondReply.recorded !== true);

    await db.gateSignOff.delete({ where: { id: resultingSignOff!.id } }).catch(() => {});
    await db.emailApproval.delete({ where: { id: ea3.id } }).catch(() => {});
    await db.gate.delete({ where: { id: testGate.id } }).catch(() => {});
    await db.stage.delete({ where: { id: stage.id } }).catch(() => {});
    await db.projectContact.delete({ where: { id: sponsorContact.id } }).catch(() => {});
    await db.emailApproval.delete({ where: { id: ea2.id } }).catch(() => {});

    console.log("\n6. Overdue reminders & escalation (Phase 4)");
    const ea4 = await db.emailApproval.create({
      data: {
        gateId: gate.id,
        contactId: contact.id,
        requestedById: pm.id,
        status: "SENT",
        sentAt: new Date(Date.now() - REMINDER_INTERVAL_MS - 60000),
      },
    });

    check(
      "GET overdue no auth -> 401",
      (await overdueGET(new Request("http://x/api/email-approvals/overdue"))).status === 401
    );

    const overdue1 = await (
      await overdueGET(new Request("http://x/api/email-approvals/overdue", { headers: { authorization: `Bearer ${TOKEN}` } }))
    ).json();
    const overdueItem1 = overdue1.overdue?.find((o: any) => o.id === ea4.id);
    check("Overdue past reminder interval, 0 reminders -> action REMIND", overdueItem1?.action === "REMIND");

    const remindResult = await (
      await remindedPOST(
        new Request(`http://x/api/email-approvals/${ea4.requestToken}/reminded`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: ea4.requestToken }),
        }),
        { params: Promise.resolve({ id: ea4.requestToken }) }
      )
    ).json();
    check("POST reminded -> reminderCount now 1", remindResult.reminderCount === 1);

    const overdue2 = await (
      await overdueGET(new Request("http://x/api/email-approvals/overdue", { headers: { authorization: `Bearer ${TOKEN}` } }))
    ).json();
    check("Freshly reminded item drops out of overdue immediately", !overdue2.overdue?.some((o: any) => o.id === ea4.id));

    // Fast-forward past the next interval and jump reminderCount to the
    // escalation threshold directly, equivalent to MAX_REMINDERS_BEFORE_ESCALATION
    // real reminder cycles having already happened.
    await db.emailApproval.update({
      where: { id: ea4.id },
      data: {
        reminderCount: MAX_REMINDERS_BEFORE_ESCALATION,
        lastReminderAt: new Date(Date.now() - REMINDER_INTERVAL_MS - 60000),
      },
    });
    const overdue3 = await (
      await overdueGET(new Request("http://x/api/email-approvals/overdue", { headers: { authorization: `Bearer ${TOKEN}` } }))
    ).json();
    const overdueItem3 = overdue3.overdue?.find((o: any) => o.id === ea4.id);
    check(`At ${MAX_REMINDERS_BEFORE_ESCALATION} reminders, past interval -> action ESCALATE`, overdueItem3?.action === "ESCALATE");

    const escalateResult = await (
      await escalatedPOST(
        new Request(`http://x/api/email-approvals/${ea4.requestToken}/escalated`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: ea4.requestToken }),
        }),
        { params: Promise.resolve({ id: ea4.requestToken }) }
      )
    ).json();
    check("POST escalated -> ok", escalateResult.ok === true && !escalateResult.alreadyEscalated);

    const overdue4 = await (
      await overdueGET(new Request("http://x/api/email-approvals/overdue", { headers: { authorization: `Bearer ${TOKEN}` } }))
    ).json();
    check("Escalated item drops out of overdue permanently", !overdue4.overdue?.some((o: any) => o.id === ea4.id));

    const reEscalateResult = await (
      await escalatedPOST(
        new Request(`http://x/api/email-approvals/${ea4.requestToken}/escalated`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: ea4.requestToken }),
        }),
        { params: Promise.resolve({ id: ea4.requestToken }) }
      )
    ).json();
    check(
      "Escalating again is idempotent, not an error",
      reEscalateResult.ok === true && reEscalateResult.alreadyEscalated === true
    );

    check(
      "Reminding an already-escalated item -> 409",
      (
        await remindedPOST(
          new Request(`http://x/api/email-approvals/${ea4.requestToken}/reminded`, {
            method: "POST",
            headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ requestToken: ea4.requestToken }),
          }),
          { params: Promise.resolve({ id: ea4.requestToken }) }
        )
      ).status === 409
    );

    const ea5 = await db.emailApproval.create({
      data: { gateId: gate.id, contactId: contact.id, requestedById: pm.id, status: "DECIDED" },
    });
    check(
      "Reminding a DECIDED item -> 409",
      (
        await remindedPOST(
          new Request(`http://x/api/email-approvals/${ea5.requestToken}/reminded`, {
            method: "POST",
            headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ requestToken: ea5.requestToken }),
          }),
          { params: Promise.resolve({ id: ea5.requestToken }) }
        )
      ).status === 409
    );
    check(
      "Escalating a DECIDED item -> 409",
      (
        await escalatedPOST(
          new Request(`http://x/api/email-approvals/${ea5.requestToken}/escalated`, {
            method: "POST",
            headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ requestToken: ea5.requestToken }),
          }),
          { params: Promise.resolve({ id: ea5.requestToken }) }
        )
      ).status === 409
    );

    await db.emailApproval.delete({ where: { id: ea5.id } }).catch(() => {});
    await db.emailApproval.delete({ where: { id: ea4.id } }).catch(() => {});

    console.log("\n7. Document review bridge (Phase 5)");
    const reviewStage = await db.stage.create({
      data: { projectId: project.id, key: `smoke_test_review_stage_${Date.now()}`, name: "Smoke Test Review Stage", order: 9995 },
    });
    const reviewGate = await db.gate.create({
      data: { stageId: reviewStage.id, key: "smoke_test_review_gate", name: "Smoke Test Review Gate", status: "IN_PROGRESS" },
    });
    const reviewDeliverable = await db.deliverable.create({
      data: { gateId: reviewGate.id, key: "smoke_test_deliverable", label: "Smoke Test Deliverable", status: "EVIDENCED" },
    });

    const testFileName = "smoke-test-evidence.txt";
    const testFileContent = Buffer.from(`Smoke test evidence content ${Date.now()}`);
    const folderPath = localEvidenceFolderPath(project, reviewStage.name);
    const uploaded = await saveLocalEvidenceFile(folderPath, testFileName, testFileContent);
    const submittedFile = await db.evidenceFile.create({
      data: { deliverableId: reviewDeliverable.id, fileName: testFileName, fileRef: uploaded.servePath, kind: "SUBMITTED", uploadedById: pm.id },
    });
    const dr = await db.documentReviewRequest.create({
      data: {
        deliverableId: reviewDeliverable.id,
        evidenceFileId: submittedFile.id,
        agentSlug: "nhs-scotland-rams-review",
        requestedById: pm.id,
      },
    });

    try {
      check(
        "GET document-reviews pending no auth -> 401",
        (await docReviewPendingGET(new Request("http://x/api/document-reviews/pending"))).status === 401
      );

      const pendingRes5 = await docReviewPendingGET(
        new Request("http://x/api/document-reviews/pending", { headers: { authorization: `Bearer ${TOKEN}` } })
      );
      const pendingBody5 = await pendingRes5.json();
      const drItem = pendingBody5.pending?.find((p: any) => p.id === dr.id);
      check("Test review present in pending list", Boolean(drItem));
      check("pending[].agentSlug correct", drItem?.agentSlug === "nhs-scotland-rams-review");
      check("pending[].evidenceFileName correct", drItem?.evidenceFileName === testFileName);
      check("pending[].deliverableLabel correct", drItem?.deliverableLabel === "Smoke Test Deliverable");

      check(
        "POST started wrong requestToken -> 404",
        (
          await docReviewStartedPOST(
            new Request(`http://x/api/document-reviews/${dr.id}/started`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: "wrong" }),
            }),
            { params: Promise.resolve({ id: dr.requestToken }) }
          )
        ).status === 404
      );
      const startedRes = await docReviewStartedPOST(
        new Request(`http://x/api/document-reviews/${dr.requestToken}/started`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: dr.requestToken }),
        }),
        { params: Promise.resolve({ id: dr.requestToken }) }
      );
      check("POST started correct -> 200", startedRes.status === 200);
      const reloadedDr = await db.documentReviewRequest.findUniqueOrThrow({ where: { id: dr.id } });
      check("Status now IN_PROGRESS with startedAt set", reloadedDr.status === "IN_PROGRESS" && reloadedDr.startedAt !== null);

      const pendingRes6 = await docReviewPendingGET(
        new Request("http://x/api/document-reviews/pending", { headers: { authorization: `Bearer ${TOKEN}` } })
      );
      const pendingBody6 = await pendingRes6.json();
      check("No longer in pending list once IN_PROGRESS", !pendingBody6.pending.some((p: any) => p.id === dr.id));

      check(
        "POST started again (already IN_PROGRESS) -> 409",
        (
          await docReviewStartedPOST(
            new Request(`http://x/api/document-reviews/${dr.requestToken}/started`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: dr.requestToken }),
            }),
            { params: Promise.resolve({ id: dr.requestToken }) }
          )
        ).status === 409
      );

      check(
        "GET evidence wrong requestToken query -> 404",
        (
          await docReviewEvidenceGET(new Request(`http://x/api/document-reviews/${dr.requestToken}/evidence?requestToken=wrong`, {
            headers: { authorization: `Bearer ${TOKEN}` },
          }), { params: Promise.resolve({ id: dr.requestToken }) })
        ).status === 404
      );
      const evidenceRes = await docReviewEvidenceGET(
        new Request(`http://x/api/document-reviews/${dr.requestToken}/evidence?requestToken=${dr.requestToken}`, {
          headers: { authorization: `Bearer ${TOKEN}` },
        }),
        { params: Promise.resolve({ id: dr.requestToken }) }
      );
      check("GET evidence correct -> 200", evidenceRes.status === 200);
      const downloadedBytes = Buffer.from(await evidenceRes.arrayBuffer());
      check("Downloaded evidence bytes match the real uploaded file exactly", downloadedBytes.equals(testFileContent));

      const reportContent = Buffer.from("Smoke test AI review report content.");
      const completeRes = await docReviewCompletePOST(
        new Request(`http://x/api/document-reviews/${dr.requestToken}/complete`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({
            requestToken: dr.requestToken,
            resultSummary: "Smoke test summary.",
            fileName: "smoke-test-review-report.txt",
            contentBase64: reportContent.toString("base64"),
          }),
        }),
        { params: Promise.resolve({ id: dr.requestToken }) }
      );
      check("POST complete -> 200 ok", completeRes.status === 200);

      const completedDr = await db.documentReviewRequest.findUniqueOrThrow({ where: { id: dr.id }, include: { resultEvidenceFile: true } });
      check("DocumentReviewRequest status now COMPLETE", completedDr.status === "COMPLETE");
      check("resultSummary set", completedDr.resultSummary === "Smoke test summary.");
      check("resultEvidenceFileId linked", Boolean(completedDr.resultEvidenceFileId));
      check("Linked result file has kind AI_REVIEW", completedDr.resultEvidenceFile?.kind === "AI_REVIEW");
      check("Linked result file has correct fileName", completedDr.resultEvidenceFile?.fileName === "smoke-test-review-report.txt");

      const allDeliverableFiles = await db.evidenceFile.findMany({ where: { deliverableId: reviewDeliverable.id } });
      check("Original SUBMITTED evidence file untouched (still kind SUBMITTED)", allDeliverableFiles.some((f) => f.id === submittedFile.id && f.kind === "SUBMITTED"));

      check(
        "POST complete again (already COMPLETE) -> 409",
        (
          await docReviewCompletePOST(
            new Request(`http://x/api/document-reviews/${dr.requestToken}/complete`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: dr.requestToken, fileName: "x.txt", contentBase64: "eA==" }),
            }),
            { params: Promise.resolve({ id: dr.requestToken }) }
          )
        ).status === 409
      );
      check(
        "POST failed on an already-COMPLETE request -> 409",
        (
          await docReviewFailedPOST(
            new Request(`http://x/api/document-reviews/${dr.requestToken}/failed`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: dr.requestToken, failureReason: "test" }),
            }),
            { params: Promise.resolve({ id: dr.requestToken }) }
          )
        ).status === 409
      );

      // Second request against a dev-stub evidence file — no real bytes exist.
      const stubFile = await db.evidenceFile.create({
        data: { deliverableId: reviewDeliverable.id, fileName: "stub.txt", fileRef: "local://dev-upload/stub.txt", kind: "SUBMITTED", uploadedById: pm.id },
      });
      const dr2 = await db.documentReviewRequest.create({
        data: { deliverableId: reviewDeliverable.id, evidenceFileId: stubFile.id, agentSlug: "nhs-scotland-sow-review", requestedById: pm.id },
      });
      check(
        "GET evidence on a dev-stub file -> 422, no real bytes",
        (
          await docReviewEvidenceGET(
            new Request(`http://x/api/document-reviews/${dr2.requestToken}/evidence?requestToken=${dr2.requestToken}`, {
              headers: { authorization: `Bearer ${TOKEN}` },
            }),
            { params: Promise.resolve({ id: dr2.requestToken }) }
          )
        ).status === 422
      );
      const failedRes = await docReviewFailedPOST(
        new Request(`http://x/api/document-reviews/${dr2.requestToken}/failed`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ requestToken: dr2.requestToken, failureReason: "No real evidence file (dev stub)." }),
        }),
        { params: Promise.resolve({ id: dr2.requestToken }) }
      );
      check("POST failed -> 200 ok", failedRes.status === 200);
      const failedDr = await db.documentReviewRequest.findUniqueOrThrow({ where: { id: dr2.id } });
      check("Status now FAILED with failureReason set", failedDr.status === "FAILED" && failedDr.failureReason !== null);
      check(
        "POST failed again (already FAILED) -> 409",
        (
          await docReviewFailedPOST(
            new Request(`http://x/api/document-reviews/${dr2.requestToken}/failed`, {
              method: "POST",
              headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
              body: JSON.stringify({ requestToken: dr2.requestToken, failureReason: "again" }),
            }),
            { params: Promise.resolve({ id: dr2.requestToken }) }
          )
        ).status === 409
      );

      await db.documentReviewRequest.delete({ where: { id: dr2.id } }).catch(() => {});
      await db.evidenceFile.delete({ where: { id: stubFile.id } }).catch(() => {});
    } finally {
      await deleteLocalEvidenceFile(folderPath, testFileName).catch(() => {});
      await deleteLocalEvidenceFile(folderPath, "smoke-test-review-report.txt").catch(() => {});
      const resultFiles = await db.evidenceFile.findMany({ where: { deliverableId: reviewDeliverable.id, kind: "AI_REVIEW" } });
      await db.documentReviewRequest.updateMany({ where: { deliverableId: reviewDeliverable.id }, data: { resultEvidenceFileId: null } }).catch(() => {});
      await db.documentReviewRequest.deleteMany({ where: { deliverableId: reviewDeliverable.id } }).catch(() => {});
      for (const f of resultFiles) await db.evidenceFile.delete({ where: { id: f.id } }).catch(() => {});
      await db.evidenceFile.delete({ where: { id: submittedFile.id } }).catch(() => {});
      await db.deliverable.delete({ where: { id: reviewDeliverable.id } }).catch(() => {});
      await db.gate.delete({ where: { id: reviewGate.id } }).catch(() => {});
      await db.stage.delete({ where: { id: reviewStage.id } }).catch(() => {});
    }
  } finally {
    await db.emailApproval.delete({ where: { id: ea.id } }).catch(() => {});
    await db.projectContact.delete({ where: { id: contact.id } }).catch(() => {});
    await db.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.error("SMOKE TEST FAILED — the API contract may have drifted from what send-email-approvals.mjs expects.");
    process.exit(1);
  }
  console.log("SMOKE TEST PASSED.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
