-- "Show times in dates" (customise feature). Only adds a column, with a default.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "showTimesInDates" BOOLEAN NOT NULL DEFAULT false;
