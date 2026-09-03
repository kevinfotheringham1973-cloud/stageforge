-- Nullable, additive -- see User.seedKey's own schema comment for why
-- this exists: standardTeam.ts/disciplineTeam.ts's hardcoded lookup
-- tables need a key that stays put regardless of what a build later
-- displays for name/email (found live, 29 Aug 2026, when the desktop
-- build's anonymize-local-demo-names.ts rewriting `email` broke every
-- one of those lookups).
ALTER TABLE "User" ADD COLUMN "seedKey" TEXT;
CREATE UNIQUE INDEX "User_seedKey_key" ON "User"("seedKey");
