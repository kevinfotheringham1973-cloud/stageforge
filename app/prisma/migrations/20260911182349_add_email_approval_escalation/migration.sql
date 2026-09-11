-- AlterTable
ALTER TABLE "EmailApproval" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;
