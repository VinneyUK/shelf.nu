-- "Remove label" (labels feature). Only adds a column.

-- AlterTable
ALTER TABLE "LabelPrintJob" ADD COLUMN "labelRemovedAt" TIMESTAMP(3);
