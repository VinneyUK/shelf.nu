-- Matter (fork): several devices on one IoT asset, and how they show. Only
-- adds: a table for the devices (each asset's existing code copied into it),
-- and the layout setting. AssetMatter is left as it was.

-- CreateTable
CREATE TABLE "MatterDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "payload" TEXT,
    "manualCode" TEXT NOT NULL,
    "vendorId" INTEGER,
    "productId" INTEGER,
    "vendorName" TEXT,
    "productName" TEXT,
    "place" TEXT,
    "transport" TEXT,
    "firmware" TEXT,
    "mac" TEXT,
    "controllers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labelPrintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatterDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatterDevice_organizationId_assetId_idx" ON "MatterDevice"("organizationId", "assetId");

-- AddForeignKey
ALTER TABLE "MatterDevice" ADD CONSTRAINT "MatterDevice_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "MatterDevice" ENABLE row level security;

-- Each asset's code so far becomes its first device
INSERT INTO "MatterDevice" ("id", "organizationId", "assetId", "payload", "manualCode", "vendorId", "productId", "vendorName", "productName", "transport", "firmware", "mac", "controllers", "createdAt", "updatedAt")
SELECT "id", "organizationId", "assetId", "payload", "manualCode", "vendorId", "productId", "vendorName", "productName", "transport", "firmware", "mac", "controllers", "createdAt", "updatedAt"
FROM "AssetMatter";

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "matterLayout" TEXT NOT NULL DEFAULT 'table';
