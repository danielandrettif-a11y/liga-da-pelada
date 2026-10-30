import type { Actor } from "../../../shared/actor.js";
import {
  type SerializedPushSubscription,
  validatePushSubscription,
} from "../domain/push-subscription.js";
import {
  type NotificationPreferences,
  type UpdateNotificationPreferencesInput,
  validateUpdatePreferencesInput,
} from "../domain/notification-preferences.js";

export interface PushConfigurationProvider {
  getPublicKey(): string | undefined;
  isConfigured(): boolean;
  getConfigurationError(): string | null;
  isBackgroundAlertsConfigured(): boolean;
}

export interface PushSubscriptionRepository {
  saveSubscription(userId: string, subscription: SerializedPushSubscription): Promise<boolean>;
  removeSubscription(userId: string, endpoint: string): Promise<boolean>;
}

export type RawPreferencesData = {
  preference: {
    match_push_enabled?: boolean | null;
    callup_push_enabled?: boolean | null;
    cartola_push_enabled?: boolean | null;
    cartola_email_enabled?: boolean | null;
    collective_push_enabled?: boolean | null;
  } | null;
  leagueSettings: {
    cartola_reminders_enabled?: boolean | null;
    cartola_email_tested_at?: string | null;
  } | null;
};

export interface NotificationPreferencesRepository {
  getPreferences(userId: string, leagueId: string): Promise<RawPreferencesData>;
  updatePreferences(userId: string, input: UpdateNotificationPreferencesInput): Promise<boolean>;
}

export async function getPushPublicKey(
  provider: PushConfigurationProvider,
): Promise<{
  success: boolean;
  publicKey: string;
  backgroundAlertsConfigured: boolean;
  error?: string;
}> {
  const publicKey = provider.getPublicKey();
  const configured = provider.isConfigured();
  const backgroundAlertsConfigured = provider.isBackgroundAlertsConfigured();
  const configurationError = provider.getConfigurationError();

  if (!publicKey || !configured) {
    return {
      success: false,
      publicKey: "",
      backgroundAlertsConfigured,
      error: configurationError || "As chaves VAPID do servidor ainda não estão completas.",
    };
  }

  return { success: true, publicKey, backgroundAlertsConfigured };
}

export async function getPushSystemStatus(
  provider: PushConfigurationProvider,
): Promise<{
  pushConfigured: boolean;
  pushConfigurationError: string | null;
  backgroundAlertsConfigured: boolean;
}> {
  return {
    pushConfigured: provider.isConfigured(),
    pushConfigurationError: provider.getConfigurationError(),
    backgroundAlertsConfigured: provider.isBackgroundAlertsConfigured(),
  };
}

export async function subscribeToPush(
  actor: Actor,
  subscription: SerializedPushSubscription,
  repository: PushSubscriptionRepository,
): Promise<{ success: boolean; error?: string }> {
  if (!actor?.userId) {
    return { success: false, error: "Entre na sua conta para ativar notificações." };
  }
  const validated = validatePushSubscription(subscription);
  const success = await repository.saveSubscription(actor.userId, validated);
  if (!success) {
    return { success: false, error: "Não foi possível ativar as notificações agora." };
  }
  return { success: true };
}

export async function unsubscribeFromPush(
  actor: Actor,
  endpoint: string,
  repository: PushSubscriptionRepository,
): Promise<{ success: boolean; error?: string }> {
  if (!actor?.userId) {
    return { success: false, error: "Sessão expirada." };
  }
  if (!endpoint || typeof endpoint !== "string") {
    return { success: false, error: "Endpoint inválido." };
  }
  const success = await repository.removeSubscription(actor.userId, endpoint);
  if (!success) {
    return { success: false, error: "Não foi possível desativar as notificações agora." };
  }
  return { success: true };
}

export async function getNotificationPreferences(
  actor: Actor,
  leagueId: string,
  repository: NotificationPreferencesRepository,
  emailConfigured: boolean,
): Promise<NotificationPreferences | null> {
  if (!actor?.userId || !leagueId) {
    return null;
  }
  const { preference, leagueSettings } = await repository.getPreferences(actor.userId, leagueId);
  return {
    matchPushEnabled: preference?.match_push_enabled !== false,
    callupPushEnabled: preference?.callup_push_enabled !== false,
    cartolaPushEnabled: preference?.cartola_push_enabled !== false,
    cartolaEmailEnabled: preference?.cartola_email_enabled !== false,
    collectivePushEnabled: preference?.collective_push_enabled !== false,
    collectiveEnabled: leagueSettings?.cartola_reminders_enabled === true,
    emailTestedAt: leagueSettings?.cartola_email_tested_at || null,
    emailConfigured,
  };
}

export async function updateNotificationPreferences(
  actor: Actor,
  input: UpdateNotificationPreferencesInput,
  repository: NotificationPreferencesRepository,
): Promise<{ success: boolean; error?: string }> {
  if (!actor?.userId) {
    return { success: false, error: "Entre na sua conta para alterar as notificações." };
  }
  const validated = validateUpdatePreferencesInput(input);
  const success = await repository.updatePreferences(actor.userId, validated);
  if (!success) {
    return { success: false, error: "Não foi possível atualizar as preferências." };
  }
  return { success: true };
}

