export type CallupChangeEvent = {
  leagueId: string;
  callupId: string;
  table: string;
  operation: string;
  occurredAt: string;
};

export interface CallupEventSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: CallupChangeEvent) => void): () => void;
}
