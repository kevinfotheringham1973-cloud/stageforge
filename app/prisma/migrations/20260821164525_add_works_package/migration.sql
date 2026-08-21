-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "worksPackageId" TEXT;

-- CreateTable
CREATE TABLE "WorksPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorksPackage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorksPackage" ADD CONSTRAINT "WorksPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_worksPackageId_fkey" FOREIGN KEY ("worksPackageId") REFERENCES "WorksPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
