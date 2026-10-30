export type NotificationPreferences = {
  matchPushEnabled: boolean;
  callupPushEnabled: boolean;
  cartolaPushEnabled: boolean;
  cartolaEmailEnabled: boolean;
  collectivePushEnabled: boolean;
  collectiveEnabled: boolean;
  emailTestedAt: string | null;
  emailConfigured: boolean;
};

export type UpdateNotificationPreferencesInput = {
  matchPushEnabled: boolean;
  callupPushEnabled: boolean;
  cartolaPushEnabled: boolean;
  cartolaEmailEnabled: boolean;
  collectivePushEnabled: boolean;
};

export function validateUpdatePreferencesInput(
  input: UpdateNotificationPreferencesInput,
): UpdateNotificationPreferencesInput {
  return {
    matchPushEnabled: Boolean(input.matchPushEnabled),
    callupPushEnabled: Boolean(input.callupPushEnabled),
    cartolaPushEnabled: Boolean(input.cartolaPushEnabled),
    cartolaEmailEnabled: Boolean(input.cartolaEmailEnabled),
    collectivePushEnabled: Boolean(input.collectivePushEnabled),
  };
}

