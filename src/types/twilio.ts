// src/types/twilio.ts
export interface TwilioVoiceWebhookBody {
  CallSid?: string;
  From?: string;
  To?: string;
  CallStatus?: string;
  Direction?: string;
  [key: string]: string | undefined;
}

export interface TwilioMediaStreamStartEvent {
  event: 'start';
  streamSid?: string;
  start?: {
    streamSid?: string;
    callSid?: string;
    accountSid?: string;
    mediaFormat?: {
      encoding?: string;
      sampleRate?: number;
      channels?: number;
    };
    customParameters?: Record<string, string>;
  };
}

export interface TwilioMediaStreamMediaEvent {
  event: 'media';
  streamSid?: string;
  media?: {
    payload?: string;
  };
}

export interface TwilioMediaStreamStopEvent {
  event: 'stop';
  streamSid?: string;
}

export interface TwilioMediaStreamConnectedEvent {
  event: 'connected';
  streamSid?: string;
}

export type TwilioMediaStreamEvent =
  | TwilioMediaStreamConnectedEvent
  | TwilioMediaStreamStartEvent
  | TwilioMediaStreamMediaEvent
  | TwilioMediaStreamStopEvent;
