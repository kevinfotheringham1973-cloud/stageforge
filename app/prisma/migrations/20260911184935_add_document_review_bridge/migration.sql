-- CreateEnum
CREATE TYPE "EvidenceFileKind" AS ENUM ('SUBMITTED', 'AI_REVIEW');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "EvidenceFile" ADD COLUMN     "kind" "EvidenceFileKind" NOT NULL DEFAULT 'SUBMITTED';

-- CreateTable
CREATE TABLE "DocumentReviewRequest" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "evidenceFileId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "requestToken" TEXT NOT NULL,
    "status" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultSummary" TEXT,
    "resultEvidenceFileId" TEXT,
    "failureReason" TEXT,

    CONSTRAINT "DocumentReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentReviewRequest_requestToken_key" ON "DocumentReviewRequest"("requestToken");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentReviewRequest_resultEvidenceFileId_key" ON "DocumentReviewRequest"("resultEvidenceFileId");

-- AddForeignKey
ALTER TABLE "DocumentReviewRequest" ADD CONSTRAINT "DocumentReviewRequest_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReviewRequest" ADD CONSTRAINT "DocumentReviewRequest_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReviewRequest" ADD CONSTRAINT "DocumentReviewRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReviewRequest" ADD CONSTRAINT "DocumentReviewRequest_resultEvidenceFileId_fkey" FOREIGN KEY ("resultEvidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
