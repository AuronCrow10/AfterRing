-- Switch provider-specific database names back from Telnyx to Twilio.
ALTER TABLE "ClientNumber" RENAME COLUMN "telnyxPhoneNumber" TO "twilioPhoneNumber";
ALTER TABLE "CallSession" RENAME COLUMN "telnyxCallControlId" TO "twilioCallSid";

ALTER INDEX "ClientNumber_telnyxPhoneNumber_key" RENAME TO "ClientNumber_twilioPhoneNumber_key";
ALTER INDEX "CallSession_telnyxCallControlId_key" RENAME TO "CallSession_twilioCallSid_key";

ALTER TABLE "CallSession" DROP COLUMN "telnyxCallSessionId";
