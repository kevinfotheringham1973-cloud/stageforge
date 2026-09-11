-- AlterTable
ALTER TABLE "DeliverableBypass" ADD COLUMN     "undoneAt" TIMESTAMP(3),
ADD COLUMN     "undoneById" TEXT,
ADD COLUMN     "undoneReason" TEXT;

-- AddForeignKey
ALTER TABLE "DeliverableBypass" ADD CONSTRAINT "DeliverableBypass_undoneById_fkey" FOREIGN KEY ("undoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
