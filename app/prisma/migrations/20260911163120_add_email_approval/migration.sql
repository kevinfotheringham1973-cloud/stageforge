-- CreateEnum
CREATE TYPE "EmailApprovalStatus" AS ENUM ('PENDING', 'SENT', 'DECIDED');

-- CreateTable
CREATE TABLE "EmailApproval" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "requestToken" TEXT NOT NULL,
    "status" "EmailApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "decision" "SignOffDecision",
    "decisionEmail" TEXT,
    "verifiedSender" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "EmailApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailApproval_requestToken_key" ON "EmailApproval"("requestToken");

-- AddForeignKey
ALTER TABLE "EmailApproval" ADD CONSTRAINT "EmailApproval_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailApproval" ADD CONSTRAINT "EmailApproval_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ProjectContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailApproval" ADD CONSTRAINT "EmailApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
