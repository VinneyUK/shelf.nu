-- Filament: box codes, empty-spool weights and store pictures (fork). Only adds.

-- AlterTable
ALTER TABLE "Spool" ADD COLUMN "filamentCode" TEXT;
ALTER TABLE "Spool" ADD COLUMN "spoolWeightGrams" INTEGER;

-- AlterTable
ALTER TABLE "SpoolCandidate" ADD COLUMN "filamentCode" TEXT;

-- CreateTable
CREATE TABLE "FilamentImage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bytes" BYTEA,
    "contentType" TEXT,
    "sourceUrl" TEXT,
    "productUrl" TEXT,
    "filamentCode" TEXT,
    "message" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilamentImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilamentImage_organizationId_key_key" ON "FilamentImage"("organizationId", "key");

ALTER TABLE "FilamentImage" ENABLE row level security;
