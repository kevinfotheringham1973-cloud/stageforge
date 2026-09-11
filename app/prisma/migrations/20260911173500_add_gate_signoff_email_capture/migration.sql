-- Hand-written (not `prisma migrate dev`, which needs an interactive
-- terminal not available in this environment -- same reason as the
-- 20260828170900_project_number_counter_per_sector migration). SQL
-- taken directly from `prisma migrate diff` against the real schema.

-- CreateEnum
CREATE TYPE "GateSignOffCapturedVia" AS ENUM ('DIRECT', 'EMAIL_PROXY');

-- AlterTable
ALTER TABLE "GateSignOff" ADD COLUMN     "capturedVia" "GateSignOffCapturedVia" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "emailApprovalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GateSignOff_emailApprovalId_key" ON "GateSignOff"("emailApprovalId");

-- AddForeignKey
ALTER TABLE "GateSignOff" ADD CONSTRAINT "GateSignOff_emailApprovalId_fkey" FOREIGN KEY ("emailApprovalId") REFERENCES "EmailApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
