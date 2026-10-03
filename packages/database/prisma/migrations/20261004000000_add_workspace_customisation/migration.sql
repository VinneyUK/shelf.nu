-- Workspace customisations (added by the customise feature).
-- Only creates a new table, so the official Shelf image keeps working on a
-- database that has it.

-- CreateTable
CREATE TABLE "WorkspaceCustomisation" (
    "organizationId" TEXT NOT NULL,
    "bookingsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hiddenMenuItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceCustomisation_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey: remove a workspace's customisations with the workspace
ALTER TABLE "WorkspaceCustomisation" ADD CONSTRAINT "WorkspaceCustomisation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "WorkspaceCustomisation" ENABLE row level security;
