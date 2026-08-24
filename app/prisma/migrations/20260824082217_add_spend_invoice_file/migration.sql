-- CreateTable
CREATE TABLE "SpendInvoiceFile" (
    "id" TEXT NOT NULL,
    "spendRecordId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileRef" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendInvoiceFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SpendInvoiceFile" ADD CONSTRAINT "SpendInvoiceFile_spendRecordId_fkey" FOREIGN KEY ("spendRecordId") REFERENCES "SpendRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendInvoiceFile" ADD CONSTRAINT "SpendInvoiceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
