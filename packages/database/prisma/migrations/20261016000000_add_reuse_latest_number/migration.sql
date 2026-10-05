-- "Reuse the latest asset number" (customise feature). Only adds a column, on by default.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "reuseLatestNumber" BOOLEAN NOT NULL DEFAULT true;
