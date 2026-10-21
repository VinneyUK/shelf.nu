-- Filament (fork): the order of sealed stock as dragged, and a daily record
-- of what's on hand of each filament for its usage chart. Only adds.

-- AlterTable
ALTER TABLE "Spool" ADD COLUMN "stockOrder" INTEGER;

-- CreateTable
CREATE TABLE "FilamentLevel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "grams" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilamentLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilamentLevel_organizationId_key_day_key" ON "FilamentLevel"("organizationId", "key", "day");

-- CreateIndex
CREATE INDEX "FilamentLevel_organizationId_key_day_idx" ON "FilamentLevel"("organizationId", "key", "day");

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "FilamentLevel" ENABLE row level security;
