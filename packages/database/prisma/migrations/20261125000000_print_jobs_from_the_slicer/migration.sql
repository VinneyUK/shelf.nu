-- Filament (fork): a print's grams come from its file's slicer figures; keep
-- the slots that fed it, its file, how far it got and where the grams came
-- from. Only adds.

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN "fedSlots" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "PrintJob" ADD COLUMN "gcodeFile" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "endPercent" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN "source" TEXT;
