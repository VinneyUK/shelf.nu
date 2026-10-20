-- Filament (fork): what was left when a spool was marked finished, so it can
-- be brought back as it was. Only adds a column.

-- AlterTable
ALTER TABLE "Spool" ADD COLUMN "retiredPercent" INTEGER;
