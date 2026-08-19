-- CreateEnum
CREATE TYPE "ComplianceEvidenceType" AS ENUM ('FILE_UPLOAD', 'ATTESTATION', 'EXTERNAL_CHECK');

-- CreateEnum
CREATE TYPE "ComplianceRequirementStatus" AS ENUM ('PENDING', 'EVIDENCED', 'OVERRIDDEN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ComplianceRuleSet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sectorVariantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRuleTemplate" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "ruleRef" TEXT,
    "evidenceType" "ComplianceEvidenceType" NOT NULL DEFAULT 'FILE_UPLOAD',
    "minFiles" INTEGER NOT NULL DEFAULT 1,
    "blocksGate" BOOLEAN NOT NULL DEFAULT true,
    "appliesToStageKeys" TEXT[],
    "appliesIfTags" TEXT[],

    CONSTRAINT "ComplianceRuleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRequirement" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "templateId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "ruleRef" TEXT,
    "evidenceType" "ComplianceEvidenceType" NOT NULL DEFAULT 'FILE_UPLOAD',
    "minFiles" INTEGER NOT NULL DEFAULT 1,
    "blocksGate" BOOLEAN NOT NULL DEFAULT true,
    "status" "ComplianceRequirementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvidenceFile" (
    "id" TEXT NOT NULL,
    "complianceRequirementId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileRef" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceOverride" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "overriddenById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "coveredRequirementIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRuleSet_key_key" ON "ComplianceRuleSet"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRuleTemplate_ruleSetId_key_key" ON "ComplianceRuleTemplate"("ruleSetId", "key");

-- AddForeignKey
ALTER TABLE "ComplianceRuleSet" ADD CONSTRAINT "ComplianceRuleSet_sectorVariantId_fkey" FOREIGN KEY ("sectorVariantId") REFERENCES "SectorVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRuleTemplate" ADD CONSTRAINT "ComplianceRuleTemplate_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "ComplianceRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ComplianceRuleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidenceFile" ADD CONSTRAINT "ComplianceEvidenceFile_complianceRequirementId_fkey" FOREIGN KEY ("complianceRequirementId") REFERENCES "ComplianceRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidenceFile" ADD CONSTRAINT "ComplianceEvidenceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceOverride" ADD CONSTRAINT "ComplianceOverride_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceOverride" ADD CONSTRAINT "ComplianceOverride_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
