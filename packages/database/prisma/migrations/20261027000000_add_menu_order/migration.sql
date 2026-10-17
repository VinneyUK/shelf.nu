-- The menu's order, as you dragged it (fork). Only adds a column.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "menuOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
