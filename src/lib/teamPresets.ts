export const TEAM_PRESETS = [
  { name: "Meia Boca Juniors", color: "#FACC15", crestUrl: "/team-crests/meia-boca-juniors.webp" },
  { name: "Patético de Madrid", color: "#F43F5E", crestUrl: "/team-crests/patetico-de-madrid.webp" },
  { name: "MilamB", color: "#DC2626", crestUrl: "/team-crests/milamb.webp" },
  { name: "Inter de Meião", color: "#2563EB", crestUrl: "/team-crests/inter-de-meiao.webp" },
  { name: "Verde", color: "#22C55E", crestUrl: null },
  { name: "Branco", color: "#E5E7EB", crestUrl: null },
] as const;

export const TEAM_CREST_URLS: ReadonlySet<string> = new Set(
  TEAM_PRESETS.flatMap((team) => team.crestUrl ? [team.crestUrl] : []),
);
