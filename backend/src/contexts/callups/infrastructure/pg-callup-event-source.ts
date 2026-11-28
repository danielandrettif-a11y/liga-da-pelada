import type { Notification, Pool, PoolClient } from "pg";
import type { CallupChangeEvent, CallupEventSource } from "../application/callup-events.js";

export function parseCallupNotification(notification: Pick<Notification, "channel" | "payload">): CallupChangeEvent | null {
  if (notification.channel !== "callup_changes" || !notification.payload) return null;
  try {
    const value = JSON.parse(notification.payload) as Partial<CallupChangeEvent>;
    if (typeof value.leagueId !== "string" || typeof value.callupId !== "string") return null;
    return {
      leagueId: value.leagueId,
      callupId: value.callupId,
      table: typeof value.table === "string" ? value.table : "unknown",
      operation: typeof value.operation === "string" ? value.operation : "UPDATE",
      occurredAt: typeof value.occurredAt === "string" ? value.occurredAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function pgCallupEventSource(pool: Pool): CallupEventSource {
  const listeners = new Set<(event: CallupChangeEvent) => void>();
  let client: PoolClient | null = null;

  const onNotification = (notification: Notification) => {
    const event = parseCallupNotification(notification);
    if (!event) return;
    for (const listener of listeners) listener(event);
  };

  return {
    async start() {
      if (client) return;
      const nextClient = await pool.connect();
      try {
        await nextClient.query("LISTEN callup_changes");
        nextClient.on("notification", onNotification);
        client = nextClient;
      } catch (error) {
        nextClient.release(true);
        throw error;
      }
    },
    async stop() {
      const current = client;
      client = null;
      if (!current) return;
      current.off("notification", onNotification);
      try {
        await current.query("UNLISTEN callup_changes");
        current.release();
      } catch {
        current.release(true);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
