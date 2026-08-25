-- CreateTable
CREATE TABLE "RejectedSignInAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "firstAttemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedSignInAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RejectedSignInAttempt_email_provider_key" ON "RejectedSignInAttempt"("email", "provider");
