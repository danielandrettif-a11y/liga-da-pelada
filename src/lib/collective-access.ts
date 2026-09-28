import type { MemberCategory } from "./types";

export function canUseCollective(isAdmin: boolean, memberCategory: MemberCategory | null | undefined) {
  return isAdmin || memberCategory === "player";
}
