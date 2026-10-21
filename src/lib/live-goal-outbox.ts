import type { RegisterGoalInput } from "@/lib/types";

export type LiveGoalOutboxStatus = "pending" | "retrying" | "failed";

export type LiveGoalOutboxPresentation = {
  scorerName: string;
  assistName: string | null;
  createdAt: string;
};

export type LiveGoalOutboxItem = {
  idempotencyKey: string;
  input: RegisterGoalInput & { idempotency_key: string };
  presentation: LiveGoalOutboxPresentation;
  status: LiveGoalOutboxStatus;
  attempts: number;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveGoalOutboxStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_PREFIX = "peladabq.live-goal-outbox.v1";
const MAX_ITEMS_PER_MATCH = 50;
const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(userId: string, matchId: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(matchId)}`;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStoredItem(value: unknown, matchId: string): value is LiveGoalOutboxItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LiveGoalOutboxItem>;
  const input = item.input as Partial<RegisterGoalInput> | undefined;
  const presentation = item.presentation as Partial<LiveGoalOutboxPresentation> | undefined;
  return (
    isString(item.idempotencyKey) &&
    !!input &&
    input.match_id === matchId &&
    input.idempotency_key === item.idempotencyKey &&
    isString(input.player_id) &&
    isString(input.team_id) &&
    !!presentation &&
    isString(presentation.scorerName) &&
    (presentation.assistName === null || typeof presentation.assistName === "string") &&
    isString(presentation.createdAt) &&
    (item.status === "pending" || item.status === "retrying" || item.status === "failed") &&
    typeof item.attempts === "number" &&
    typeof item.retryable === "boolean" &&
    (item.lastError === null || typeof item.lastError === "string") &&
    isString(item.createdAt) &&
    isString(item.updatedAt)
  );
}

/**
 * Lê somente a fila da conta e partida informadas. Entradas antigas, inválidas
 * ou de outra partida nunca chegam à tela ao vivo.
 */
export function loadLiveGoalOutbox(
  storage: LiveGoalOutboxStorage,
  userId: string,
  matchId: string,
  now = Date.now(),
): LiveGoalOutboxItem[] {
  try {
    const raw = storage.getItem(storageKey(userId, matchId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => isStoredItem(item, matchId))
      .filter((item) => {
        const createdAt = Date.parse(item.createdAt);
        return Number.isFinite(createdAt) && now - createdAt <= MAX_ITEM_AGE_MS;
      })
      .slice(-MAX_ITEMS_PER_MATCH);
  } catch {
    return [];
  }
}

export function saveLiveGoalOutbox(
  storage: LiveGoalOutboxStorage,
  userId: string,
  matchId: string,
  items: LiveGoalOutboxItem[],
) {
  try {
    const key = storageKey(userId, matchId);
    if (items.length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(items.slice(-MAX_ITEMS_PER_MATCH)));
  } catch {
    // Safari privado, quota cheia ou armazenamento desabilitado não podem
    // derrubar o fluxo ao vivo. A fila continua válida em memória.
  }
}

export function createLiveGoalOutboxItem(
  input: RegisterGoalInput & { idempotency_key: string },
  presentation: LiveGoalOutboxPresentation,
): LiveGoalOutboxItem {
  return {
    idempotencyKey: input.idempotency_key,
    input: { ...input },
    presentation: { ...presentation },
    status: "pending",
    attempts: 0,
    retryable: true,
    lastError: null,
    createdAt: presentation.createdAt,
    updatedAt: presentation.createdAt,
  };
}

export function enqueueLiveGoal(
  items: LiveGoalOutboxItem[],
  item: LiveGoalOutboxItem,
): LiveGoalOutboxItem[] {
  if (items.some((entry) => entry.idempotencyKey === item.idempotencyKey)) return items;
  return [...items, item].slice(-MAX_ITEMS_PER_MATCH);
}

export function updateLiveGoalOutboxItem(
  items: LiveGoalOutboxItem[],
  idempotencyKey: string,
  update: Partial<Pick<LiveGoalOutboxItem, "status" | "attempts" | "retryable" | "lastError" | "updatedAt">>,
): LiveGoalOutboxItem[] {
  return items.map((item) => item.idempotencyKey === idempotencyKey ? { ...item, ...update } : item);
}

export function removeLiveGoalOutboxItem(items: LiveGoalOutboxItem[], idempotencyKey: string) {
  return items.filter((item) => item.idempotencyKey !== idempotencyKey);
}

export function reconcileLiveGoalOutbox(
  items: LiveGoalOutboxItem[],
  confirmedIdempotencyKeys: Iterable<string>,
) {
  const confirmed = new Set(confirmedIdempotencyKeys);
  return items.filter((item) => !confirmed.has(item.idempotencyKey));
}

export function getLiveGoalOutboxScoreDelta(items: LiveGoalOutboxItem[], teamAId: string) {
  return items.reduce((score, item) => {
    // Falha de regra de negócio é definitiva e já sofreu rollback visual.
    if (item.status === "failed" && !item.retryable) return score;
    if (item.input.team_id === teamAId) score.a += 1;
    else score.b += 1;
    return score;
  }, { a: 0, b: 0 });
}

export function liveGoalOutboxItemToOptimisticEvent(item: LiveGoalOutboxItem) {
  return {
    id: `opt-${item.idempotencyKey}`,
    match_id: item.input.match_id,
    player_id: item.input.player_id,
    assist_player_id: item.input.assist_player_id || null,
    team_id: item.input.team_id,
    event_type: "goal",
    is_own_goal: Boolean(item.input.is_own_goal),
    minute: item.input.minute ?? 0,
    created_at: item.presentation.createdAt,
    idempotency_key: item.idempotencyKey,
    player: { name: item.presentation.scorerName },
    assist_player: item.presentation.assistName ? { name: item.presentation.assistName } : null,
    isOptimistic: true,
    outboxStatus: item.status,
    outboxRetryable: item.retryable,
  };
}
