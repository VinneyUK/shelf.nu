-- Box numbers and box labels (labels feature). Only adds a table and a column.

-- CreateTable
CREATE TABLE "BoxNumber" (
    "kitId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "BoxNumber_pkey" PRIMARY KEY ("kitId")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoxNumber_organizationId_number_key" ON "BoxNumber"("organizationId", "number");

-- AddForeignKey
ALTER TABLE "BoxNumber" ADD CONSTRAINT "BoxNumber_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "LabelPrintJob" ADD COLUMN "kitId" TEXT;

-- CreateIndex
CREATE INDEX "LabelPrintJob_kitId_status_idx" ON "LabelPrintJob"("kitId", "status");

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "BoxNumber" ENABLE row level security;
