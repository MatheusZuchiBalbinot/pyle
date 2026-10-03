-- AlterTable
ALTER TABLE "ConfigChangeEvent" ADD COLUMN     "detail" JSONB,
ADD COLUMN     "entityName" TEXT;
