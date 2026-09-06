#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const quantile = (values, percentile) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

function qualityPercentiles(rows, valueOf) {
  const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a) || String(a.player_key).localeCompare(String(b.player_key)));
  const result = new Map();
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && valueOf(sorted[end + 1]) === valueOf(sorted[start])) end += 1;
    const quality = sorted.length === 1 ? 0.5 : 1 - ((start + end) / 2) / (sorted.length - 1);
    for (let index = start; index <= end; index += 1) result.set(sorted[index].player_key, quality);
    start = end + 1;
  }
  return result;
}

function blendedQuality(rows, valueOf) {
  const overall = qualityPercentiles(rows, valueOf);
  const byRole = new Map();
  for (const profile of ["defensive", "midfield", "offensive"]) {
    const group = rows.filter((row) => row.player_profile === profile);
    const role = group.length >= 3 ? qualityPercentiles(group, valueOf) : overall;
    for (const row of group) {
      byRole.set(row.player_key, 0.65 * (role.get(row.player_key) ?? 0.5) + 0.35 * (overall.get(row.player_key) ?? 0.5));
    }
  }
  for (const row of rows) {
    if (!byRole.has(row.player_key)) byRole.set(row.player_key, overall.get(row.player_key) ?? 0.5);
  }
  return byRole;
}

function priceCaps(roundNumber, config) {
  return {
    up: Math.min(config.matureUpCap, config.initialUpCap + (roundNumber - 1) * config.capStep),
    down: Math.min(config.matureDownCap, config.initialDownCap + (roundNumber - 1) * config.capStep),
  };
}

function simulate(performances, config) {
  const prices = new Map(performances.map((row) => [row.player_key, 10]));
  const history = new Map();
  const changes = [];
  const rounds = [...new Set(performances
    .filter((row) => Number(row.games) > 0)
    .map((row) => Number(row.round_number)))].sort((a, b) => a - b);

  for (const roundNumber of rounds) {
    const rows = performances.filter((row) => Number(row.round_number) === roundNumber && Number(row.games) > 0);
    for (const row of rows) {
      const playerHistory = history.get(row.player_key) ?? [];
      playerHistory.push(Number(row.market_base_points));
      history.set(row.player_key, playerHistory);
    }

    const roundQuality = blendedQuality(rows, (row) => Number(row.market_base_points));
    const seasonQuality = blendedQuality(rows, (row) => average(history.get(row.player_key) ?? [Number(row.market_base_points)]));
    const caps = priceCaps(roundNumber, config);

    for (const row of rows) {
      const before = prices.get(row.player_key) ?? 10;
      const quality = config.roundWeight * (roundQuality.get(row.player_key) ?? 0.5)
        + (1 - config.roundWeight) * (seasonQuality.get(row.player_key) ?? 0.5);
      const target = config.floor + (config.ceiling - config.floor) * Math.pow(Math.max(0, Math.min(1, quality)), config.curve);
      const desired = before + (target - before) * config.strength;
      const after = roundMoney(Math.max(
        config.hardFloor,
        before * (1 - caps.down),
        Math.min(config.hardCeiling, before * (1 + caps.up), desired),
      ));
      prices.set(row.player_key, after);
      changes.push({
        playerKey: row.player_key,
        roundNumber,
        before,
        after,
        variation: before ? (after - before) / before : 0,
        quality,
        target,
        points: Number(row.market_base_points),
      });
    }
  }

  const finalPrices = [...prices.values()];
  const lastRound = Math.max(...rounds);
  const lastChanges = changes.filter((item) => item.roundNumber === lastRound);
  const priorPrices = lastChanges.map((item) => item.before);
  const cheapThreshold = quantile(priorPrices, 0.25);
  const expensiveThreshold = quantile(priorPrices, 0.75);
  const cheapHits = lastChanges.filter((item) => item.before <= cheapThreshold && item.quality >= 0.75);
  const expensiveMisses = lastChanges.filter((item) => item.before >= expensiveThreshold && item.quality <= 0.25);
  const topSixCost = [...finalPrices].sort((a, b) => b - a).slice(0, 6).reduce((sum, value) => sum + value, 0);
  const summary = {
    min: Math.min(...finalPrices),
    p25: quantile(finalPrices, 0.25),
    median: quantile(finalPrices, 0.5),
    mean: average(finalPrices),
    p75: quantile(finalPrices, 0.75),
    max: Math.max(...finalPrices),
    spread: Math.max(...finalPrices) - Math.min(...finalPrices),
    topSixCost,
    cheapRecovery: average(cheapHits.map((item) => item.variation)),
    expensivePenalty: average(expensiveMisses.map((item) => item.variation)),
    cheapHits: cheapHits.length,
    expensiveMisses: expensiveMisses.length,
    above12: finalPrices.filter((price) => price >= 12).length,
    below9: finalPrices.filter((price) => price <= 9).length,
  };
  return { config, summary, changes, prices };
}

function scoreScenario({ summary, config }) {
  const distance = (value, target, weight) => Math.abs(value - target) * weight;
  let score = 100;
  score -= distance(summary.mean, 10, 18);
  score -= distance(summary.median, 10, 12);
  score -= distance(summary.max, 12.8, 6);
  score -= distance(summary.min, 8.3, 5);
  score -= distance(summary.topSixCost, 73, 1.5);
  score -= Math.max(0, 0.10 - summary.cheapRecovery) * 180;
  score -= Math.max(0, summary.expensivePenalty + 0.08) * 120;
  if (summary.max > 13.5) score -= (summary.max - 13.5) * 30;
  if (summary.spread < 3.5) score -= (3.5 - summary.spread) * 20;
  // A rodada precisa ser o sinal principal para permitir recuperação rápida,
  // sem apagar a consistência já construída na temporada.
  score -= Math.abs(config.roundWeight - 0.70) * 2;
  return score;
}

const auditPath = resolve(process.argv[2] || "cartola-audit.json.md");
const payload = JSON.parse(await readFile(auditPath, "utf8"));
const performances = payload.performances ?? [];
if (!performances.length) throw new Error("Auditoria sem performances.");

const scenarios = [];
for (const floor of [6, 6.5, 7]) {
  for (const ceiling of [17, 18, 19]) {
    for (const curve of [1.5, 1.7, 1.9]) {
      for (const strength of [0.18, 0.22, 0.26]) {
        for (const roundWeight of [0.6, 0.7, 0.8]) {
          const result = simulate(performances, {
            floor, ceiling, curve, strength, roundWeight,
            hardFloor: 5,
            hardCeiling: 20,
            initialUpCap: 0.08,
            initialDownCap: 0.06,
            capStep: 0.02,
            matureUpCap: 0.15,
            matureDownCap: 0.12,
          });
          scenarios.push({ ...result, score: scoreScenario(result) });
        }
      }
    }
  }
}

scenarios.sort((a, b) => b.score - a.score);
const best = scenarios[0];
const exportedRounds = [...new Set(performances.map((row) => Number(row.round_number)))].sort((a, b) => a - b);
const effectiveRounds = exportedRounds.filter((round) => performances.some((row) => Number(row.round_number) === round && Number(row.games) > 0));
const latestEffectiveRound = Math.max(...effectiveRounds);
const maximumAfterThree = roundMoney(10 * 1.08 * 1.10 * 1.12);
const minimumAfterThree = roundMoney(10 * 0.94 * 0.92 * 0.90);
const result = {
  source: {
    exportedOfficialRounds: exportedRounds,
    effectiveOfficialRounds: effectiveRounds,
    warning: effectiveRounds.length < exportedRounds.length
      ? "O export contém uma rodada sem jogos/pontos utilizáveis; a migração V10 recalibra com os dados reais do banco."
      : null,
    performances: performances.length,
    playersByRound: Object.fromEntries(exportedRounds.map((round) => [round, {
      rows: performances.filter((row) => Number(row.round_number) === round).length,
      participants: performances.filter((row) => Number(row.round_number) === round && Number(row.games) > 0).length,
    }])),
  },
  selected: {
    score: roundMoney(best.score),
    config: best.config,
    summary: best.summary,
    threeRoundSafety: { maximumAfterThree, minimumAfterThree },
  },
  topFive: scenarios.slice(0, 5).map((item) => ({ score: roundMoney(item.score), config: item.config, summary: item.summary })),
  latestEffectiveRound,
  latestEffectiveChanges: best.changes
    .filter((item) => item.roundNumber === latestEffectiveRound)
    .sort((a, b) => b.variation - a.variation)
    .map((item) => ({
      playerKey: item.playerKey,
      points: item.points,
      quality: roundMoney(item.quality),
      before: item.before,
      after: item.after,
      variationPercent: roundMoney(item.variation * 100),
    })),
};

console.log(JSON.stringify(result, null, 2));
