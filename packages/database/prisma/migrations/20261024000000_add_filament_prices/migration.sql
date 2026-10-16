-- Filament: prices from the Bambu store (fork). Only adds a table.

-- CreateTable
CREATE TABLE "FilamentPrice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "variants" JSONB,
    "productUrl" TEXT,
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilamentPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilamentPrice_organizationId_key_key" ON "FilamentPrice"("organizationId", "key");

ALTER TABLE "FilamentPrice" ENABLE row level security;
