/*
  Warnings:

  - Added the required column `caseId` to the `EmailApproval` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roleKey` to the `EmailApproval` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "EmailApprovalStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "EmailApproval" ADD COLUMN     "caseId" TEXT NOT NULL,
ADD COLUMN     "roleKey" TEXT NOT NULL,
ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ApprovalRoutingTier" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "escalateToRoleKey" TEXT,
    "waitHours" INTEGER NOT NULL DEFAULT 72,
    "maxRemindersBeforeAdvancing" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "ApprovalRoutingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRoutingTierContact" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "ApprovalRoutingTierContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRoutingTier_projectId_roleKey_tier_key" ON "ApprovalRoutingTier"("projectId", "roleKey", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRoutingTierContact_tierId_contactId_key" ON "ApprovalRoutingTierContact"("tierId", "contactId");

-- AddForeignKey
ALTER TABLE "ApprovalRoutingTier" ADD CONSTRAINT "ApprovalRoutingTier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingTierContact" ADD CONSTRAINT "ApprovalRoutingTierContact_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "ApprovalRoutingTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingTierContact" ADD CONSTRAINT "ApprovalRoutingTierContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ProjectContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
