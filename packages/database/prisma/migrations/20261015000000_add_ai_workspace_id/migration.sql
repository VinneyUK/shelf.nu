-- The Anthropic workspace ID, for API keys that aren't tied to one workspace. Only adds a column.

-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT '';
