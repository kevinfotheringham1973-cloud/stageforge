-- Hand-written, not `prisma migrate dev`-generated: the default plan
-- for converting an enum column to TEXT is drop-and-recreate (data
-- loss on bypassAuthority/overrideAuthority for every existing row).
-- Since Postgres enum values are already stored as their string
-- names, an in-place cast preserves every existing value exactly.

-- Role gains the exact-match flag, replacing the old hardcoded
-- EXACT_MATCH_AUTHORITIES list in permissions.ts.
ALTER TABLE "Role" ADD COLUMN "isExactMatchAuthority" BOOLEAN NOT NULL DEFAULT false;

-- DeliverableTemplate.bypassAuthority: enum -> TEXT, in place.
ALTER TABLE "DeliverableTemplate" ALTER COLUMN "bypassAuthority" DROP DEFAULT;
ALTER TABLE "DeliverableTemplate" ALTER COLUMN "bypassAuthority" TYPE TEXT USING "bypassAuthority"::TEXT;
ALTER TABLE "DeliverableTemplate" ALTER COLUMN "bypassAuthority" SET DEFAULT 'PM';

-- Deliverable.bypassAuthority: enum -> TEXT, in place.
ALTER TABLE "Deliverable" ALTER COLUMN "bypassAuthority" DROP DEFAULT;
ALTER TABLE "Deliverable" ALTER COLUMN "bypassAuthority" TYPE TEXT USING "bypassAuthority"::TEXT;
ALTER TABLE "Deliverable" ALTER COLUMN "bypassAuthority" SET DEFAULT 'PM';

-- ComplianceRuleTemplate.overrideAuthority: enum -> TEXT, in place.
ALTER TABLE "ComplianceRuleTemplate" ALTER COLUMN "overrideAuthority" DROP DEFAULT;
ALTER TABLE "ComplianceRuleTemplate" ALTER COLUMN "overrideAuthority" TYPE TEXT USING "overrideAuthority"::TEXT;
ALTER TABLE "ComplianceRuleTemplate" ALTER COLUMN "overrideAuthority" SET DEFAULT 'SRO';

-- ComplianceRequirement.overrideAuthority: enum -> TEXT, in place.
ALTER TABLE "ComplianceRequirement" ALTER COLUMN "overrideAuthority" DROP DEFAULT;
ALTER TABLE "ComplianceRequirement" ALTER COLUMN "overrideAuthority" TYPE TEXT USING "overrideAuthority"::TEXT;
ALTER TABLE "ComplianceRequirement" ALTER COLUMN "overrideAuthority" SET DEFAULT 'SRO';

-- Now safe to drop: nothing references the enum type any more.
DROP TYPE "BypassAuthority";
