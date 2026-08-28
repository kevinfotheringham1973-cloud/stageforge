-- Project.isDemoProject (28 Aug 2026) -- gates the "fast-forward this
-- gate" demo action (fabricates evidence/sign-offs). Defaults false so
-- a genuinely new project never has this capability without an
-- explicit opt-in.
ALTER TABLE "Project" ADD COLUMN "isDemoProject" BOOLEAN NOT NULL DEFAULT false;

-- Every project on the platform today is Kevin's own test/demo work --
-- there are no real paying customers yet -- so backfill every existing
-- row to true rather than leaving them at the new default.
UPDATE "Project" SET "isDemoProject" = true;
