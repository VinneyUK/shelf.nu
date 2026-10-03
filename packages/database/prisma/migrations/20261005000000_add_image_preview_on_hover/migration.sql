-- Image preview on hover in the assets list (customise feature).
-- Only adds a column, with a default, so existing rows are unaffected.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "imagePreviewOnHover" BOOLEAN NOT NULL DEFAULT true;
