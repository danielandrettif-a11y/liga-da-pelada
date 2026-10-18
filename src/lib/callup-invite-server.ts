import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallupInviteTarget = {
  id: string;
  league_id: string;
  date: string;
  start_time: string | null;
  round_type: string | null;
  stadium_name: string | null;
};

export const resolveCallupInvite = cache(async (token: string): Promise<CallupInviteTarget | null> => {
  if (!UUID_PATTERN.test(token)) return null;
  const client = createServiceClient();
  if (!client) return null;
  const { data, error } = await client
    .from("callups")
    .select("id, league_id, date, start_time, round_type, stadium_name")
    .eq("invite_token", token)
    .in("status", ["open", "locked", "converted"])
    .maybeSingle();
  if (error || !data) return null;
  return data as CallupInviteTarget;
});
