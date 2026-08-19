-- CreateTable
CREATE TABLE "ResourceAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "allocationPercent" INTEGER NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAllocation_userId_projectId_key" ON "ResourceAllocation"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
