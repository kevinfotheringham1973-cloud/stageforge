-- CreateTable
CREATE TABLE "ProjectAdditionalTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAdditionalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAdditionalTemplate_projectId_templateId_key" ON "ProjectAdditionalTemplate"("projectId", "templateId");

-- AddForeignKey
ALTER TABLE "ProjectAdditionalTemplate" ADD CONSTRAINT "ProjectAdditionalTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAdditionalTemplate" ADD CONSTRAINT "ProjectAdditionalTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
