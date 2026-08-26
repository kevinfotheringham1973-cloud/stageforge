-- CreateTable
CREATE TABLE "SuccessfulSignIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "loginCount" INTEGER NOT NULL DEFAULT 1,
    "firstLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuccessfulSignIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuccessfulSignIn_userId_key" ON "SuccessfulSignIn"("userId");

-- AddForeignKey
ALTER TABLE "SuccessfulSignIn" ADD CONSTRAINT "SuccessfulSignIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
