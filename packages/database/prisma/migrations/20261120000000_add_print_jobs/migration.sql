-- Filament (fork): the prints the printer ran, and what each filament used.
-- Only adds.

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "startLevels" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJobUse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "spoolId" TEXT,
    "key" TEXT NOT NULL,
    "slot" INTEGER,
    "grams" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION,

    CONSTRAINT "PrintJobUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintJob_organizationId_startedAt_idx" ON "PrintJob"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "PrintJobUse_organizationId_key_idx" ON "PrintJobUse"("organizationId", "key");

-- CreateIndex
CREATE INDEX "PrintJobUse_jobId_idx" ON "PrintJobUse"("jobId");

-- AddForeignKey
ALTER TABLE "PrintJobUse" ADD CONSTRAINT "PrintJobUse_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PrintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "PrintJob" ENABLE row level security;
ALTER TABLE "PrintJobUse" ENABLE row level security;
