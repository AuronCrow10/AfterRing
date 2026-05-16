// src/types/realtime.ts
export interface RealtimeServerEvent {
  type: string;
  [key: string]: any;
}

export interface RealtimeOutputTextDeltaEvent extends RealtimeServerEvent {
  type: 'response.output_text.delta';
  response_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface RealtimeOutputTextDoneEvent extends RealtimeServerEvent {
  type: 'response.output_text.done';
  response_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface RealtimeResponseDoneFunctionCallItem {
  object: 'realtime.item';
  id: string;
  type: 'function_call';
  status: string;
  name: string;
  call_id: string;
  arguments: string;
}

export interface RealtimeResponseDoneEvent extends RealtimeServerEvent {
  type: 'response.done';
  response: {
    id: string;
    status: string;
    output: RealtimeResponseDoneFunctionCallItem[] | any[];
    [key: string]: any;
  };
}
