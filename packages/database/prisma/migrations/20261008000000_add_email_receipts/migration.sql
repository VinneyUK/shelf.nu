-- Email receipts (email receipts feature). Only adds tables and a column.

-- AlterTable
ALTER TABLE "AssetAttachment" ADD COLUMN "emailReceiptId" TEXT;

-- CreateIndex
CREATE INDEX "AssetAttachment_emailReceiptId_idx" ON "AssetAttachment"("emailReceiptId");

-- CreateTable
CREATE TABLE "EmailReceiptSettings" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL DEFAULT 'imap.gmail.com',
    "port" INTEGER NOT NULL DEFAULT 993,
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL DEFAULT '',
    "mailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "processedFolder" TEXT NOT NULL DEFAULT 'Shelf',
    "allowedSenders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReceiptSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "EmailReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "attachedTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailReceipt_organizationId_messageId_key" ON "EmailReceipt"("organizationId", "messageId");

-- CreateIndex
CREATE INDEX "EmailReceipt_organizationId_status_createdAt_idx" ON "EmailReceipt"("organizationId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailReceiptSettings" ADD CONSTRAINT "EmailReceiptSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReceipt" ADD CONSTRAINT "EmailReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "EmailReceiptSettings" ENABLE row level security;
ALTER TABLE "EmailReceipt" ENABLE row level security;
