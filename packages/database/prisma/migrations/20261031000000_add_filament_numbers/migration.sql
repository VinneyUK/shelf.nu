-- Filament labels (fork): FIL-0001 numbers, one per line and colour, and
-- filament QR codes and label print jobs. Only adds a table and columns.

-- CreateTable
CREATE TABLE "FilamentNumber" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilamentNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilamentNumber_organizationId_key_key" ON "FilamentNumber"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FilamentNumber_organizationId_number_key" ON "FilamentNumber"("organizationId", "number");

-- AlterTable
ALTER TABLE "Qr" ADD COLUMN "filamentId" TEXT;

-- CreateIndex
CREATE INDEX "Qr_filamentId_idx" ON "Qr"("filamentId");

-- AddForeignKey
ALTER TABLE "Qr" ADD CONSTRAINT "Qr_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "FilamentNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "LabelPrintJob" ADD COLUMN "filamentId" TEXT,
ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'asset',
ADD COLUMN "subtitle" TEXT,
ADD COLUMN "boxCode" TEXT;

-- CreateIndex
CREATE INDEX "LabelPrintJob_filamentId_status_idx" ON "LabelPrintJob"("filamentId", "status");

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "FilamentNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Number the filament already in stock, oldest first: a filament's place is
-- when its first spool or refill was added. The key matches filamentKey():
-- the line and colour, trimmed and lower case.
INSERT INTO "FilamentNumber" ("id", "organizationId", "key", "number")
SELECT
    'fil_' || replace(gen_random_uuid()::text, '-', ''),
    g."organizationId",
    g."key",
    ROW_NUMBER() OVER (PARTITION BY g."organizationId" ORDER BY g."firstAdded", g."key")
FROM (
    SELECT
        "organizationId",
        lower(btrim("type")) || '|' || lower(btrim("colourName")) AS "key",
        MIN("createdAt") AS "firstAdded"
    FROM "Spool"
    GROUP BY "organizationId", lower(btrim("type")) || '|' || lower(btrim("colourName"))
) g;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "FilamentNumber" ENABLE row level security;
