-- Tile view for the assets list (fork). Only adds a column.

-- AlterTable
ALTER TABLE "AssetIndexSettings" ADD COLUMN "tileView" BOOLEAN NOT NULL DEFAULT false;
