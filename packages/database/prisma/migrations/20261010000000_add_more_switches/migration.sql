-- Locations, kits, asset models and QR download switches (customise feature).
-- Only adds columns with defaults.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "locationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "kitsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "assetModelsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "qrDownloadsEnabled" BOOLEAN NOT NULL DEFAULT true;
