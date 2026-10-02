type TeamReferenceInput = {
  position?: number | null;
};

export function getTeamReference(
  team?: TeamReferenceInput | null,
  fallbackIndex = 0,
) {
  const position = Number(team?.position);
  const ordinal = Number.isInteger(position) && position > 0
    ? position
    : Math.max(0, fallbackIndex) + 1;

  let remaining = ordinal;
  let reference = "";

  while (remaining > 0) {
    remaining -= 1;
    reference = String.fromCharCode(65 + (remaining % 26)) + reference;
    remaining = Math.floor(remaining / 26);
  }

  return reference;
}

export function formatTeamNameWithReference(
  team: TeamReferenceInput & { name?: string | null },
  fallbackIndex = 0,
) {
  const reference = getTeamReference(team, fallbackIndex);
  return team.name ? `${reference} · ${team.name}` : `Time ${reference}`;
}
