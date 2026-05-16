-- AlterTable
ALTER TABLE "IntakeLead" ADD COLUMN     "extraFields" JSONB;

-- CreateTable
CREATE TABLE "ClientIntakeConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientIntakeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientIntakeConfig_clientId_key" ON "ClientIntakeConfig"("clientId");

-- AddForeignKey
ALTER TABLE "ClientIntakeConfig" ADD CONSTRAINT "ClientIntakeConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
