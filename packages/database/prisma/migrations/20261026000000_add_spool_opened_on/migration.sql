-- Filament: when a spool was opened (fork). Adds a column; no spool is changed otherwise.

-- AlterTable
ALTER TABLE "Spool" ADD COLUMN "openedOn" DATE;

-- Spools that are plainly open already (in the AMS, partly used, run out or
-- retired) are marked opened on the day they were added. Untouched spools on
-- the shelf stay New.
UPDATE "Spool"
SET "openedOn" = "createdAt"::date
WHERE "amsSlot" IS NOT NULL OR "remainingPercent" < 100 OR "status" IN ('empty', 'retired');
