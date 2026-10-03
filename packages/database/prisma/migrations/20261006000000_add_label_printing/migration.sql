-- Label printing (labels feature). Only adds tables and a column, so the
-- official Shelf image keeps working on a database that has them.

-- AlterTable
ALTER TABLE "WorkspaceCustomisation" ADD COLUMN "labelsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "LabelSettings" (
    "organizationId" TEXT NOT NULL,
    "haUrl" TEXT NOT NULL DEFAULT '',
    "haToken" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "labelWidth" INTEGER NOT NULL DEFAULT 240,
    "leftMargin" INTEGER NOT NULL DEFAULT 8,
    "rotate" INTEGER NOT NULL DEFAULT 90,
    "density" INTEGER,
    "queueTagName" TEXT NOT NULL DEFAULT 'QRP',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "LabelPrintJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT,
    "sequentialId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "source" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "LabelPrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabelPrintJob_organizationId_status_createdAt_idx" ON "LabelPrintJob"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LabelPrintJob_assetId_status_idx" ON "LabelPrintJob"("assetId", "status");

-- AddForeignKey
ALTER TABLE "LabelSettings" ADD CONSTRAINT "LabelSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "LabelSettings" ENABLE row level security;
ALTER TABLE "LabelPrintJob" ENABLE row level security;
