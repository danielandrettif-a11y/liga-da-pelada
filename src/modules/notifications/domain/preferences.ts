export type SerializedPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
};

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

