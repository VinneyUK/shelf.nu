-- Filament (fork): saved colour palettes. Only adds a table.

-- CreateTable
CREATE TABLE "FilamentPalette" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilamentPalette_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FilamentPalette_organizationId_idx" ON "FilamentPalette"("organizationId");

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "FilamentPalette" ENABLE row level security;
