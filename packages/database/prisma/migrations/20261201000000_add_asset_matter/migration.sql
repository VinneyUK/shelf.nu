-- Matter (fork): a device's setup code (encrypted) and details. Only adds.

-- CreateTable
CREATE TABLE "AssetMatter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "payload" TEXT,
    "manualCode" TEXT NOT NULL,
    "vendorId" INTEGER,
    "productId" INTEGER,
    "vendorName" TEXT,
    "productName" TEXT,
    "transport" TEXT,
    "firmware" TEXT,
    "mac" TEXT,
    "controllers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMatter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetMatter_assetId_key" ON "AssetMatter"("assetId");

-- CreateIndex
CREATE INDEX "AssetMatter_organizationId_idx" ON "AssetMatter"("organizationId");

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "AssetMatter" ENABLE row level security;
