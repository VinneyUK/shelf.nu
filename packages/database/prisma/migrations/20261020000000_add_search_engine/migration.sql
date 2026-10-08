-- Search engine for the "Search the web" button (customise feature). Only adds a column.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "searchEngine" TEXT NOT NULL DEFAULT 'google';
