export const DUPLICATE_LEAGUE_NAME_MESSAGE = "Já existe uma pelada com esse nome.";

export function normalizeLeagueName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function isDuplicateLeagueNameError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}
