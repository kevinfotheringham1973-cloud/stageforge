-- ProjectNumberCounter moves from a single global row to one row per
-- SectorVariant (28 Aug 2026), so a new England-tenant project stops
-- being issued the next number out of Scotland's own 30000s block.
-- Hand-written (not `prisma migrate dev`, which needs an interactive
-- terminal) so the existing row's backfill and the new England row can
-- be inserted in the same migration, rather than as a separate
-- data-only script.

-- 1. id: fixed default(1) -> autoincrement, so a second/third row can
--    be created without an explicit id.
CREATE SEQUENCE IF NOT EXISTS "ProjectNumberCounter_id_seq";
ALTER SEQUENCE "ProjectNumberCounter_id_seq" OWNED BY "ProjectNumberCounter"."id";
ALTER TABLE "ProjectNumberCounter" ALTER COLUMN "id" SET DEFAULT nextval('"ProjectNumberCounter_id_seq"');
SELECT setval('"ProjectNumberCounter_id_seq"', (SELECT COALESCE(MAX(id), 0) FROM "ProjectNumberCounter"));

-- 2. Add the column nullable first -- the existing row has to be
--    backfilled before it can become NOT NULL.
ALTER TABLE "ProjectNumberCounter" ADD COLUMN "sectorVariantId" TEXT;

-- 3. Backfill the existing (Scotland) row's counter to the "health"
--    SectorVariant -- this is the same counter that's been issuing
--    30000s numbers all along, just now explicitly scoped to it.
UPDATE "ProjectNumberCounter"
SET "sectorVariantId" = (SELECT "id" FROM "SectorVariant" WHERE "key" = 'health')
WHERE "sectorVariantId" IS NULL;

-- 4. England's own counter row. Starts at 40001 -- seedEnglandDemo
--    already issued project #40001 directly via db.project.create
--    (bypassing this counter), so the next one issued through this
--    counter must be #40002, not a collision with that seeded project.
INSERT INTO "ProjectNumberCounter" ("sectorVariantId", "value")
SELECT "id", 40001 FROM "SectorVariant" WHERE "key" = 'health_england'
ON CONFLICT DO NOTHING;

-- 5. Now safe to enforce NOT NULL + UNIQUE + FK.
ALTER TABLE "ProjectNumberCounter" ALTER COLUMN "sectorVariantId" SET NOT NULL;
CREATE UNIQUE INDEX "ProjectNumberCounter_sectorVariantId_key" ON "ProjectNumberCounter"("sectorVariantId");
ALTER TABLE "ProjectNumberCounter" ADD CONSTRAINT "ProjectNumberCounter_sectorVariantId_fkey"
  FOREIGN KEY ("sectorVariantId") REFERENCES "SectorVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
