import fs from "node:fs";

const inputPath = process.argv.find((arg) => arg.startsWith("--input="))?.slice(8) || "market-v11-audit.json";
const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) || "market-v11-report.md";
const selfTest = process.argv.includes("--self-test");
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))];
};
const money = (value) => value === null || value === undefined ? "—" : `C$ ${Number(value).toFixed(2).replace(".", ",")}`;
const percent = (value) => value === null || value === undefined ? "—" : `${(Number(value) * 100).toFixed(1)}%`;

function difficulty({ eliteRate, medianEliteRatio, previous = 1, targetElite = .20, targetMedian = .86, step = .03, min = .94, max = 1.18 }) {
  const affordabilityGap = clamp((eliteRate - targetElite) / .30, -1, 1);
  const medianGap = clamp((medianEliteRatio - targetMedian) / .20, -1, 1);
  const pressure = clamp(.65 * affordabilityGap + .35 * medianGap, -1, 1);
  return { pressure, next: clamp(previous + clamp(pressure * step, -step, step), min, max) };
}

function readAudit() {
  if (selfTest) return {
    season: { players_per_team: 5 }, settings: {},
    accounts: [{ budget: 50, roundsPlayed: 3 }, { budget: 60, roundsPlayed: 3 }, { budget: 70, roundsPlayed: 3 }],
    players: Array.from({ length: 30 }, (_, index) => ({ currentPrice: 5 + index / 2, profile: index % 3 === 0 ? "offensive" : index % 3 === 1 ? "midfield" : "defensive" })),
    performances: [], savedLineups: [],
  };
  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

function costs(players, teamSize) {
  const sorted = (profile, dir = 1, near = null) => players.filter((player) => player.profile === profile).sort((a, b) => near === null ? dir * (a.currentPrice - b.currentPrice) : Math.abs(a.percentile - near) - Math.abs(b.percentile - near));
  const formations = [[2, 1], [1, 2]];
  const result = { economy: [], competitive: [], elite: [] };
  for (const [attack, midfield] of formations) {
    for (const [mode, dir, near] of [["economy", 1, null], ["competitive", 1, .60], ["elite", -1, null]]) {
      const chosen = [...sorted("offensive", dir, near).slice(0, attack), ...sorted("midfield", dir, near).slice(0, midfield), ...sorted("defensive", dir, near).slice(0, 2)];
      if (teamSize === 6) {
        const ids = new Set(chosen);
        const keeper = [...players].filter((player) => !ids.has(player)).sort((a, b) => near === null ? dir * (a.currentPrice - b.currentPrice) : Math.abs(a.percentile - near) - Math.abs(b.percentile - near))[0];
        if (keeper) chosen.push(keeper);
      }
      if (chosen.length === teamSize) result[mode].push(chosen.reduce((sum, player) => sum + Number(player.currentPrice), 0));
    }
  }
  return {
    economy: Math.min(...result.economy),
    competitive: percentile(result.competitive, .5),
    elite: Math.max(...result.elite),
  };
}

const audit = readAudit();
const players = (audit.players || []).map((player, index, source) => ({ ...player, percentile: source.length <= 1 ? .5 : index / (source.length - 1) })).sort((a, b) => Number(a.currentPrice) - Number(b.currentPrice));
players.forEach((player, index) => { player.percentile = players.length <= 1 ? .5 : index / (players.length - 1); });
const budgets = (audit.accounts || []).filter((account) => Number(account.roundsPlayed) > 0).map((account) => Number(account.budget));
const lineup = costs(players, Number(audit.season?.players_per_team || audit.season?.playersPerTeam || 5));
const eliteRate = budgets.length ? budgets.filter((budget) => budget >= lineup.elite).length / budgets.length : 0;
const competitiveRate = budgets.length ? budgets.filter((budget) => budget >= lineup.competitive).length / budgets.length : 0;
const economyRate = budgets.length ? budgets.filter((budget) => budget >= lineup.economy).length / budgets.length : 0;
const medianRatio = (percentile(budgets, .5) || 0) / lineup.elite;
const current = difficulty({ eliteRate, medianEliteRatio: medianRatio });
const priceValues = players.map((player) => Number(player.currentPrice));
const report = [
  "# Auditoria — Mercado V11", "",
  `Gerado em ${new Date().toISOString()}. Dados anonimizados: ${budgets.length} patrimônios ativos e ${players.length} atletas.`, "",
  "## Saúde atual", "",
  "| Indicador | Valor | Meta |", "|---|---:|---:|",
  `| Time econômico válido | ${money(lineup.economy)} | acessível a todos |`,
  `| Time competitivo | ${money(lineup.competitive)} | ≥80% acessível |`,
  `| Time elite | ${money(lineup.elite)} | 15–25% acessível |`,
  `| Acesso ao time econômico | ${percent(economyRate)} | 100% |`,
  `| Acesso ao time competitivo | ${percent(competitiveRate)} | ≥80% |`,
  `| Acesso ao time elite | ${percent(eliteRate)} | 15–25% |`,
  `| Patrimônio mediano ÷ elite | ${medianRatio.toFixed(2)} | 0,82–0,90 |`,
  `| Preço P10 / P50 / P90 | ${money(percentile(priceValues,.1))} / ${money(percentile(priceValues,.5))} / ${money(percentile(priceValues,.9))} | P90/P10 1,70–2,60 |`,
  `| Pressão global | ${current.pressure.toFixed(3)} | -0,20 a 0,20 |`,
  `| Dificuldade próxima rodada | ${current.next.toFixed(3)} | 0,94–1,18 |`, "",
  "## Decisão", "",
  economyRate === 1 && competitiveRate >= .8 ? "O mercado preserva uma escalação viável. A pressão global indica o ajuste gradual da próxima rodada." : "Atenção: o cenário ainda não cumpre as garantias mínimas de acesso; não ative a migration 142 antes de investigar a escalação econômica.", "",
].join("\n");
if (selfTest) {
  if (!Number.isFinite(lineup.elite) || current.next < .94 || current.next > 1.18) throw new Error("Self-test V11 falhou");
  console.log("Self-test V11 aprovado");
} else {
  fs.writeFileSync(outputPath, report, "utf8");
  console.log(`Relatório criado: ${outputPath}`);
}
