-- AlterTable
ALTER TABLE "Gate" ADD COLUMN     "lateCompletionNote" TEXT,
ADD COLUMN     "lateCompletionNoteAt" TIMESTAMP(3),
ADD COLUMN     "lateCompletionNoteById" TEXT;

-- AddForeignKey
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_lateCompletionNoteById_fkey" FOREIGN KEY ("lateCompletionNoteById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
