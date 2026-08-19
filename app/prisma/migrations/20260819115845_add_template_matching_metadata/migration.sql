-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "description" TEXT,
ADD COLUMN     "matchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
