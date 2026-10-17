-- The Bambu printer Shelf reads the AMS from (fork). Only adds a table.

-- CreateTable
CREATE TABLE "Printer" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "accessCode" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "Printer" ENABLE row level security;
