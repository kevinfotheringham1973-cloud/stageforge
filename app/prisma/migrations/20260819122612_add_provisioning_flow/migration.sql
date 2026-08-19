-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ProvisioningReviewDecision" AS ENUM ('APPROVED', 'REVISE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "provisioningBrief" TEXT,
ADD COLUMN     "provisioningMatchReasoning" TEXT,
ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ProvisioningReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "decision" "ProvisioningReviewDecision" NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisioningReview_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningReview" ADD CONSTRAINT "ProvisioningReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningReview" ADD CONSTRAINT "ProvisioningReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
