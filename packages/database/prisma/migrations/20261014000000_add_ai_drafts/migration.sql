-- AI settings and asset drafts (AI feature). Only adds tables.

-- CreateTable
CREATE TABLE "AiSettings" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5-5',
    "draftReceipts" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AssetDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "valuation" DOUBLE PRECISION,
    "valueEstimated" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "purchasedOn" DATE,
    "vendor" TEXT,
    "notes" TEXT,
    "error" TEXT,
    "emailReceiptId" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileBytes" BYTEA,
    "sourceText" TEXT,
    "createdAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetDraft_organizationId_status_idx" ON "AssetDraft"("organizationId", "status");

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "AiSettings" ENABLE row level security;
ALTER TABLE "AssetDraft" ENABLE row level security;
