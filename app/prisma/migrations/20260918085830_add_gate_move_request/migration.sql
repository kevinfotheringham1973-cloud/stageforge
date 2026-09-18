-- CreateEnum
CREATE TYPE "GateMoveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "GateMoveRequest" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "previousTargetStartDate" TIMESTAMP(3),
    "previousTargetEndDate" TIMESTAMP(3),
    "proposedTargetStartDate" TIMESTAMP(3),
    "proposedTargetEndDate" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "GateMoveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,

    CONSTRAINT "GateMoveRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GateMoveRequest" ADD CONSTRAINT "GateMoveRequest_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateMoveRequest" ADD CONSTRAINT "GateMoveRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateMoveRequest" ADD CONSTRAINT "GateMoveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
