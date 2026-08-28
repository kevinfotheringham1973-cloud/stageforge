-- AlterTable
-- Confines every ShareLink to exactly one project (closes a real GDPR/
-- security leak: previously an anonymous demo viewer could browse to any
-- project on the platform, real people's names included). The two
-- pre-existing rows in this table were both dead (one expired, one
-- already revoked as a stopgap) and were deleted by hand before this
-- migration, so a NOT NULL column with no default is safe here.
ALTER TABLE "ShareLink" ADD COLUMN     "projectId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
