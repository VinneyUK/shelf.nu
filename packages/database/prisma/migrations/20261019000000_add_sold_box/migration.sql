-- Sold items go into a "Sold" box (sold feature). Only adds columns.

-- AlterTable
ALTER TABLE "AssetSale" ADD COLUMN "previousKitId" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "soldBoxEnabled" BOOLEAN NOT NULL DEFAULT true;
