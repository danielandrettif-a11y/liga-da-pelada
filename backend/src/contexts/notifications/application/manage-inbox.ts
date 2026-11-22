import type { Actor } from "../../../shared/actor.js";
import {
  type DesiredInboxNotification,
  type InboxNotificationRecord,
  validateDesiredNotification,
} from "../domain/inbox-notification.js";

export interface InboxRepository {
  getPreview(userId: string): Promise<InboxNotificationRecord[]>;
  markRead(userId: string, ids?: string[]): Promise<boolean>;
  syncAndList(
    userId: string,
    leagueId: string,
    desired: DesiredInboxNotification[],
  ): Promise<InboxNotificationRecord[]>;
}

export async function getInboxPreview(
  actor: Actor,
  repository: InboxRepository,
): Promise<InboxNotificationRecord[]> {
  if (!actor?.userId) {
    return [];
  }
  return repository.getPreview(actor.userId);
}

export async function markInboxRead(
  actor: Actor,
  repository: InboxRepository,
  ids?: string[],
): Promise<{ success: boolean }> {
  if (!actor?.userId) {
    return { success: false };
  }
  const cleanIds = ids?.filter((id) => typeof id === "string" && id.trim().length > 0);
  const success = await repository.markRead(actor.userId, cleanIds?.length ? cleanIds : undefined);
  return { success };
}

export async function syncAndListInbox(
  actor: Actor,
  leagueId: string,
  desired: DesiredInboxNotification[],
  repository: InboxRepository,
): Promise<InboxNotificationRecord[]> {
  if (!actor?.userId || !leagueId) {
    return [];
  }
  const validatedDesired = (desired || []).map(validateDesiredNotification);
  return repository.syncAndList(actor.userId, leagueId, validatedDesired);
}

