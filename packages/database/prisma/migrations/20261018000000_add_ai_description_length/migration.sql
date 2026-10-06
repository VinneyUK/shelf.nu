-- How long an AI-drafted description may be, in characters. Only adds a column.

-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN "descriptionLength" INTEGER NOT NULL DEFAULT 300;
