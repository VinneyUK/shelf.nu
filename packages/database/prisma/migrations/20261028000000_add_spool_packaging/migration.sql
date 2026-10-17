-- Filament: a refill or a spool (filament with its spool) (fork). Only adds columns.

-- AlterTable
ALTER TABLE "Spool" ADD COLUMN "packaging" TEXT NOT NULL DEFAULT 'spool';

-- AlterTable
ALTER TABLE "SpoolCandidate" ADD COLUMN "packaging" TEXT NOT NULL DEFAULT 'spool';
