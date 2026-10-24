-- Matter (fork): each device's own name ("Kettle plug"), for its label and
-- later for Home Assistant. Only adds a column.

-- AlterTable
ALTER TABLE "MatterDevice" ADD COLUMN "name" TEXT;
