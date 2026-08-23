-- AlterTable
ALTER TABLE "ComplianceRequirement" ADD COLUMN     "additionalApproverRoleKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ComplianceRuleTemplate" ADD COLUMN     "additionalApproverRoleKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ComplianceCoSignOff" (
    "id" TEXT NOT NULL,
    "complianceRequirementId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "signedOffById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCoSignOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCoSignOff_complianceRequirementId_roleKey_key" ON "ComplianceCoSignOff"("complianceRequirementId", "roleKey");

-- AddForeignKey
ALTER TABLE "ComplianceCoSignOff" ADD CONSTRAINT "ComplianceCoSignOff_complianceRequirementId_fkey" FOREIGN KEY ("complianceRequirementId") REFERENCES "ComplianceRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCoSignOff" ADD CONSTRAINT "ComplianceCoSignOff_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
