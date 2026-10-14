-- Filament (fork): Bambu Lab spools and the approval inbox. Only adds tables and a column.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "filamentEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Spool" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "colourName" TEXT NOT NULL,
    "colourHex" TEXT NOT NULL,
    "weightGrams" INTEGER NOT NULL DEFAULT 1000,
    "remainingPercent" INTEGER NOT NULL DEFAULT 100,
    "pricePaid" DOUBLE PRECISION,
    "purchasedOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "amsSlot" INTEGER,
    "tagUid" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpoolCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "colourName" TEXT NOT NULL,
    "colourHex" TEXT NOT NULL,
    "weightGrams" INTEGER NOT NULL DEFAULT 1000,
    "remainingPercent" INTEGER,
    "pricePaid" DOUBLE PRECISION,
    "purchasedOn" DATE,
    "tagUid" TEXT,
    "amsSlot" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpoolCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Spool_organizationId_tagUid_key" ON "Spool"("organizationId", "tagUid");
CREATE INDEX "Spool_organizationId_status_idx" ON "Spool"("organizationId", "status");
CREATE INDEX "SpoolCandidate_organizationId_status_idx" ON "SpoolCandidate"("organizationId", "status");

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "Spool" ENABLE row level security;
ALTER TABLE "SpoolCandidate" ENABLE row level security;
