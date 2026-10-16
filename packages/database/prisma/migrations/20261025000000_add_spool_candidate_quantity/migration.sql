-- Filament: how many spools an inbox entry stands for (fork). Only adds a column.

-- AlterTable
ALTER TABLE "SpoolCandidate" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
