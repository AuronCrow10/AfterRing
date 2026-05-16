-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "planMinutesLimit" INTEGER NOT NULL,
    "hardLimit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNumber" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "twilioPhoneNumber" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "code" TEXT NOT NULL,
    "includedMinutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientNumberId" TEXT NOT NULL,
    "twilioCallSid" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "billableSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeLead" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "capturedName" TEXT,
    "capturedPhone" TEXT,
    "capturedEmail" TEXT,
    "capturedReason" TEXT,
    "preferredContactTime" TEXT,
    "rawSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_planCode_idx" ON "Client"("planCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClientNumber_twilioPhoneNumber_key" ON "ClientNumber"("twilioPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_twilioCallSid_key" ON "CallSession"("twilioCallSid");

-- CreateIndex
CREATE INDEX "CallSession_clientId_startedAt_idx" ON "CallSession"("clientId", "startedAt");

-- CreateIndex
CREATE INDEX "IntakeLead_clientId_createdAt_idx" ON "IntakeLead"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNumber" ADD CONSTRAINT "ClientNumber_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_clientNumberId_fkey" FOREIGN KEY ("clientNumberId") REFERENCES "ClientNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeLead" ADD CONSTRAINT "IntakeLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeLead" ADD CONSTRAINT "IntakeLead_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
