-- "Look up prices on the web" for AI photo drafts. Only adds a column, off by default.

-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN "webSearch" BOOLEAN NOT NULL DEFAULT false;
