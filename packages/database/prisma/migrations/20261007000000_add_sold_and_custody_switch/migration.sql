-- Sold assets (sold feature) and the custody switch (customise feature).
-- Only adds a table and a column.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "custodyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AssetSale" (
    "assetId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "soldOn" DATE NOT NULL,
    "price" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetSale_pkey" PRIMARY KEY ("assetId")
);

-- CreateIndex
CREATE INDEX "AssetSale_organizationId_soldOn_idx" ON "AssetSale"("organizationId", "soldOn");

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "AssetSale" ENABLE row level security;
