-- CreateEnum
CREATE TYPE "ApprovalBucket" AS ENUM ('LIFECYCLE_REPLACEMENT', 'SMALL_WORKS', 'VARIATION');

-- CreateEnum
CREATE TYPE "SpendRecordStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "SpendApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SpendRecord" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "bucket" "ApprovalBucket" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "invoiceReference" TEXT,
    "blocksGate" BOOLEAN NOT NULL DEFAULT true,
    "recordedById" TEXT NOT NULL,
    "status" "SpendRecordStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendApproval" (
    "id" TEXT NOT NULL,
    "spendRecordId" TEXT NOT NULL,
    "decision" "SpendApprovalDecision" NOT NULL,
    "approvedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendApproval_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SpendRecord" ADD CONSTRAINT "SpendRecord_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendRecord" ADD CONSTRAINT "SpendRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendApproval" ADD CONSTRAINT "SpendApproval_spendRecordId_fkey" FOREIGN KEY ("spendRecordId") REFERENCES "SpendRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendApproval" ADD CONSTRAINT "SpendApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
