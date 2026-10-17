-- Filament: Bambu's box codes, from the Bambu store (fork). Only adds a table.

-- CreateTable
CREATE TABLE "FilamentCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "colourName" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilamentCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilamentCode_organizationId_code_key" ON "FilamentCode"("organizationId", "code");

ALTER TABLE "FilamentCode" ENABLE row level security;
