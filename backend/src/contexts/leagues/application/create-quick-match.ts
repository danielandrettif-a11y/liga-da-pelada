import type { Actor } from "../../../shared/actor.js";
import { parseQuickMatch, type QuickMatchInput, type QuickMatchSession } from "../domain/quick-match.js";

export interface QuickMatchRepository {
  create(input: QuickMatchInput, actor: Actor): Promise<QuickMatchSession>;
}

export function createQuickMatch(
  input: { date: string; start_time: string; field_name: string; map_url: string },
  actor: Actor,
  repository: QuickMatchRepository,
): Promise<QuickMatchSession> {
  return repository.create(parseQuickMatch(input), actor);
}
