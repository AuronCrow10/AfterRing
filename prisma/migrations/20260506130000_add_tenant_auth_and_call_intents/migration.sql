-- Add tenant users and browser call intents.
DROP INDEX IF EXISTS "ClientNumber_twilioPhoneNumber_key";

CREATE UNIQUE INDEX "ClientNumber_clientId_twilioPhoneNumber_key"
  ON "ClientNumber"("clientId", "twilioPhoneNumber");

CREATE INDEX "ClientNumber_twilioPhoneNumber_idx"
  ON "ClientNumber"("twilioPhoneNumber");

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BrowserCallIntent" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toNumber" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BrowserCallIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrowserCallIntent_clientId_expiresAt_idx"
  ON "BrowserCallIntent"("clientId", "expiresAt");

CREATE INDEX "BrowserCallIntent_userId_expiresAt_idx"
  ON "BrowserCallIntent"("userId", "expiresAt");

ALTER TABLE "BrowserCallIntent" ADD CONSTRAINT "BrowserCallIntent_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrowserCallIntent" ADD CONSTRAINT "BrowserCallIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
