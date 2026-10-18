-- Quantities (fork): selling part of an asset. Only adds a table and a column.

-- AlterTable
ALTER TABLE "AssetSale" ADD COLUMN "quantity" INTEGER;

-- CreateTable
CREATE TABLE "AssetPartSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "soldOn" DATE NOT NULL,
    "price" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPartSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetPartSale_organizationId_soldOn_idx" ON "AssetPartSale"("organizationId", "soldOn");

-- CreateIndex
CREATE INDEX "AssetPartSale_assetId_idx" ON "AssetPartSale"("assetId");

-- AddForeignKey
ALTER TABLE "AssetPartSale" ADD CONSTRAINT "AssetPartSale_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "AssetPartSale" ENABLE row level security;
