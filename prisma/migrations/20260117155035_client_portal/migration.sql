/*
  Warnings:

  - A unique constraint covering the columns `[recallToken]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "recallToken" TEXT;

-- AlterTable
ALTER TABLE "IntakeLead" ADD COLUMN     "calledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Client_recallToken_key" ON "Client"("recallToken");
