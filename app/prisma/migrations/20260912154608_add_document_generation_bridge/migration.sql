-- AlterEnum
ALTER TYPE "EvidenceFileKind" ADD VALUE 'AI_DRAFT';

-- CreateTable
CREATE TABLE "DocumentGenerationRequest" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
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

    CONSTRAINT "DocumentGenerationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentGenerationSource" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "evidenceFileId" TEXT NOT NULL,

    CONSTRAINT "DocumentGenerationSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGenerationRequest_requestToken_key" ON "DocumentGenerationRequest"("requestToken");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGenerationRequest_resultEvidenceFileId_key" ON "DocumentGenerationRequest"("resultEvidenceFileId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGenerationSource_requestId_evidenceFileId_key" ON "DocumentGenerationSource"("requestId", "evidenceFileId");

-- AddForeignKey
ALTER TABLE "DocumentGenerationRequest" ADD CONSTRAINT "DocumentGenerationRequest_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationRequest" ADD CONSTRAINT "DocumentGenerationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationRequest" ADD CONSTRAINT "DocumentGenerationRequest_resultEvidenceFileId_fkey" FOREIGN KEY ("resultEvidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationSource" ADD CONSTRAINT "DocumentGenerationSource_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DocumentGenerationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationSource" ADD CONSTRAINT "DocumentGenerationSource_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
