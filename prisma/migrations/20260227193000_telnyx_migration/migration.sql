-- Rename Twilio-specific columns to Telnyx equivalents
ALTER TABLE "ClientNumber" RENAME COLUMN "twilioPhoneNumber" TO "telnyxPhoneNumber";
ALTER TABLE "CallSession" RENAME COLUMN "twilioCallSid" TO "telnyxCallControlId";

ALTER INDEX "ClientNumber_twilioPhoneNumber_key" RENAME TO "ClientNumber_telnyxPhoneNumber_key";
ALTER INDEX "CallSession_twilioCallSid_key" RENAME TO "CallSession_telnyxCallControlId_key";

-- Add Telnyx call metadata + WS auth token
ALTER TABLE "CallSession" ADD COLUMN "telnyxCallSessionId" TEXT;
ALTER TABLE "CallSession" ADD COLUMN "mediaStreamToken" TEXT;

CREATE UNIQUE INDEX "CallSession_mediaStreamToken_key" ON "CallSession"("mediaStreamToken");
