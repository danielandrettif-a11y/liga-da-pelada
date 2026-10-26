"use server";

import { getCurrentAccount } from "@/lib/auth";
import { rosterApiFor } from "@/modules/roster/infrastructure/roster-api-session";
import {
  emptyAccountCareer,
  sumCareer,
  type AccountCareerRow,
  type CareerTotals,
} from "@/modules/roster/domain/account-career";

export type { AccountCareerRow, CareerTotals } from "@/modules/roster/domain/account-career";

export async function getMyAccountCareer() {
  const account = await getCurrentAccount();
  if (!account.user) return emptyAccountCareer();
  const api = await rosterApiFor(account.client);
  if (api) {
    try {
      return await api.getMyAccountCareer();
    } catch {
      return emptyAccountCareer();
    }
  }
  const { data, error } = await account.client.rpc("get_my_account_career_stats");
  if (error) return emptyAccountCareer();
  const rows = (data || []) as AccountCareerRow[];
  return {
    rows,
    overall: sumCareer(rows),
    official: sumCareer(rows.filter((row) => row.round_type === "official")),
    friendly: sumCareer(rows.filter((row) => row.round_type === "friendly")),
  };
}
