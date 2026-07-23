-- AlterTable
ALTER TABLE "Ingestion" ADD COLUMN "discardReason" TEXT;
ALTER TABLE "Ingestion" ADD COLUMN "discardedAt" DATETIME;
