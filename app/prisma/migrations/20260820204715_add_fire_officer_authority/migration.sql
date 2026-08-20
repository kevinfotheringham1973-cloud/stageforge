-- AlterEnum
ALTER TYPE "BypassAuthority" ADD VALUE 'FIRE_OFFICER';

-- AlterTable
ALTER TABLE "ComplianceRequirement" ADD COLUMN     "overrideAuthority" "BypassAuthority" NOT NULL DEFAULT 'SRO';

-- AlterTable
ALTER TABLE "ComplianceRuleTemplate" ADD COLUMN     "overrideAuthority" "BypassAuthority" NOT NULL DEFAULT 'SRO';
