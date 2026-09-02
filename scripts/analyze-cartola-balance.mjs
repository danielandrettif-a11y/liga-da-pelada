#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROLES = ["GOL", "DEF", "MEI", "ATA"];
const ROLE_CLARITY = {
  GOL: { score: 7.0, note: "A vaga é aberta, mas o bônus depende de atuação real no gol e pode acumular por rodízio." },
  DEF: { score: 5.5, note: "A proteção aparece uma vez na base do atleta defensivo e outra na vaga correta; é potente, porém pouco óbvia." },
  MEI: { score: 7.5, note: "Assistência fecha em 4 pontos e o Maestro cria um degrau adicional ao chegar a duas." },
  ATA: { score: 8.5, note: "O gol-base é universal e o Artilheiro acrescenta um único degrau ao marcar dois gols." },
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const clamp = (value, min = 0, max = 10) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const standardDeviation = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
};
const quantile = (values, percentile) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const percent = (value) => `${round2(value * 100).toFixed(1).replace(".", ",")}%`;
const points = (value) => round2(value).toFixed(2).replace(".", ",");
const grade = (value) => round2(value).toFixed(1).replace(".", ",");
const markdownCell = (value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const keyOfRound = (row) => `${row.league_key}/${row.season_key}/${row.round_number}`;
const keyOfLineup = (row) => String(row.lineup_key);

function deviationScore(deviation, fullCredit = 0.15, zeroCredit = 0.6) {
  if (deviation <= fullCredit) return 10;
  if (deviation >= zeroCredit) return 0;
  return 10 * (1 - (deviation - fullCredit) / (zeroCredit - fullCredit));
}

function parsePayload(raw) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("O arquivo não contém um JSON reconhecível. Copie apenas a célula audit_payload do Supabase.");
    }
    const candidate = trimmed.slice(firstBrace, lastBrace + 1).replaceAll('""', '"');
    parsed = JSON.parse(candidate);
  }
  if (Array.isArray(parsed) && parsed.length === 1) parsed = parsed[0];
  if (typeof parsed?.audit_payload === "string") parsed = JSON.parse(parsed.audit_payload);
  else if (parsed?.audit_payload) parsed = parsed.audit_payload;
  if (number(parsed?.schemaVersion ?? parsed?.schema_version) !== 1) {
    throw new Error(`Versão de exportação incompatível: ${parsed?.schemaVersion ?? parsed?.schema_version ?? "ausente"}.`);
  }
  return parsed;
}

function normalizePayload(payload) {
  return {
    ...payload,
    rounds: Array.isArray(payload.rounds) ? payload.rounds : [],
    lineups: Array.isArray(payload.lineups) ? payload.lineups : [],
    selections: Array.isArray(payload.selections) ? payload.selections : [],
    performances: Array.isArray(payload.performances) ? payload.performances : [],
  };
}

function currentConfigFromRound(round) {
  const rules = round?.rules ?? {};
  return {
    label: "Atual",
    goalPoints: number(rules.goalPoints, 5),
    assistPoints: number(rules.assistPoints, 3),
    winPoints: number(rules.winPoints, 4),
    lossPoints: number(rules.lossPoints, -2),
    goalkeeperAppearancePoints: number(rules.goalkeeperAppearancePoints, 3),
    goalConcededPoints: number(rules.goalConcededPoints, -1),
    ownGoalPoints: number(rules.ownGoalPoints, -3),
    goalkeeperCleanSheetBonus: number(rules.goalkeeperCleanSheetBonus, 4),
    defensiveBaseCleanBonus: number(rules.defensiveBaseCleanBonus, 2),
    defensiveBaseOneGoalBonus: number(rules.defensiveBaseOneGoalBonus, 1),
    defensiveSlotCleanBonus: number(rules.defensiveSlotCleanBonus, 2),
    defensiveSlotOneGoalBonus: number(rules.defensiveSlotOneGoalBonus, 1),
    midfieldAssistTotal: number(rules.midfieldAssistTotal, 4),
    midfieldMaestroBonus: number(rules.midfieldMaestroBonus, 3),
    attackerBraceBonus: number(rules.attackerBraceBonus, 3),
    captainMultiplier: number(rules.captainMultiplier, 1.5),
    topScorerPredictionPoints: number(rules.topScorerPredictionPoints, 8),
    topAssistPredictionPoints: number(rules.topAssistPredictionPoints, 6),
    predictionScale: 1,
  };
}

function rawBasePoints(selection, config) {
  return number(selection.goals) * config.goalPoints
    + number(selection.assists) * config.assistPoints
    + number(selection.wins) * config.winPoints
    + number(selection.losses) * config.lossPoints
    + number(selection.goalkeeper_games) * config.goalkeeperAppearancePoints
    + number(selection.goals_conceded) * config.goalConcededPoints
    + (selection.player_profile === "defensive"
      ? number(selection.defensive_clean_games) * config.defensiveBaseCleanBonus
        + number(selection.defensive_one_goal_games) * config.defensiveBaseOneGoalBonus
      : 0)
    + number(selection.own_goals) * config.ownGoalPoints;
}

function positionBonus(selection, config) {
  if (!selection.role_scoring_active) return 0;
  if (selection.slot_role === "GOL") {
    return number(selection.goalkeeper_games) > 0
      ? number(selection.clean_sheets) * config.goalkeeperCleanSheetBonus
      : 0;
  }
  if (!selection.is_position_correct) return 0;
  if (selection.slot_role === "DEF") {
    return number(selection.defensive_clean_games) * config.defensiveSlotCleanBonus
      + number(selection.defensive_one_goal_games) * config.defensiveSlotOneGoalBonus;
  }
  if (selection.slot_role === "MEI") {
    return number(selection.assists) * (config.midfieldAssistTotal - config.assistPoints)
      + (number(selection.assists) >= 2 ? config.midfieldMaestroBonus : 0);
  }
  if (selection.slot_role === "ATA") {
    return number(selection.goals) >= 2 ? config.attackerBraceBonus : 0;
  }
  return 0;
}

function simulatedSelection(selection, config) {
  if (!selection.role_scoring_active) {
    return {
      base: number(selection.base_points),
      position: number(selection.position_bonus),
      captain: number(selection.captain_bonus),
      total: number(selection.total_points),
    };
  }
  const base = rawBasePoints(selection, config);
  const position = positionBonus(selection, config);
  const packagePoints = base + position;
  const captain = selection.is_captain ? packagePoints * (config.captainMultiplier - 1) : 0;
  return { base, position, captain, total: packagePoints + captain };
}

function validateStoredTotals(data) {
  const tolerance = 0.011;
  const selectionFailures = data.selections
    .map((row) => ({
      row,
      difference: number(row.base_points) + number(row.position_bonus) + number(row.captain_bonus) - number(row.total_points),
    }))
    .filter(({ difference }) => Math.abs(difference) > tolerance);
  const roundConfigs = new Map(data.rounds.map((round) => [keyOfRound(round), currentConfigFromRound(round)]));
  const formulaFailures = [];
  let formulaChecks = 0;
  for (const row of data.selections.filter((selection) => selection.role_scoring_active)) {
    const config = roundConfigs.get(keyOfRound(row));
    if (!config) continue;
    const expected = simulatedSelection(row, config);
    const differences = {
      base: expected.base - number(row.base_points),
      position: expected.position - number(row.position_bonus),
      captain: expected.captain - number(row.captain_bonus),
      total: expected.total - number(row.total_points),
    };
    formulaChecks += Object.keys(differences).length;
    for (const [component, difference] of Object.entries(differences)) {
      if (Math.abs(difference) > tolerance) formulaFailures.push({ row, component, difference });
    }
  }
  const lineupChecks = [];
  for (const row of data.lineups) {
    lineupChecks.push(
      { row, component: "player_points", difference: number(row.recomposed_player_points) - number(row.stored_player_points) },
      { row, component: "prediction_points", difference: number(row.top_scorer_points) + number(row.top_assist_points)
        + number(row.challenge_points) - number(row.stored_prediction_points) },
      { row, component: "total_points", difference: number(row.recomposed_player_points) + number(row.stored_prediction_points)
        + number(row.card_points) - number(row.stored_total_points) },
    );
  }
  const lineupFailures = lineupChecks.filter(({ difference }) => Math.abs(difference) > tolerance);
  const checked = data.selections.length + formulaChecks + lineupChecks.length;
  const failures = selectionFailures.length + formulaFailures.length + lineupFailures.length;
  return {
    checked,
    failures,
    successRate: checked ? 1 - failures / checked : 0,
    selectionFailures,
    formulaFailures,
    lineupFailures,
  };
}

function roleMetrics(data, config) {
  const eligible = data.selections.filter((row) =>
    row.role_scoring_active && ROLES.includes(row.slot_role) && row.is_position_correct && number(row.games) > 0);
  const valuesByRole = Object.fromEntries(ROLES.map((role) => [role, []]));
  for (const row of eligible) {
    const simulated = simulatedSelection(row, config);
    valuesByRole[row.slot_role].push({
      row,
      perGame: (simulated.base + simulated.position) / Math.max(1, number(row.games)),
      packagePoints: simulated.base + simulated.position,
      positionBonus: simulated.position,
    });
  }
  const provisional = Object.fromEntries(ROLES.map((role) => {
    const rows = valuesByRole[role];
    const perGame = rows.map((item) => item.perGame);
    const packagePoints = rows.map((item) => item.packagePoints);
    const mean = average(perGame);
    return [role, {
      role,
      samples: rows.length,
      mean,
      median: quantile(perGame, 0.5),
      p75: quantile(perGame, 0.75),
      p90: quantile(perGame, 0.9),
      max: perGame.length ? Math.max(...perGame) : 0,
      standardDeviation: standardDeviation(perGame),
      zeroRate: rows.length ? packagePoints.filter((value) => value === 0).length / rows.length : 0,
      negativeRate: rows.length ? packagePoints.filter((value) => value < 0).length / rows.length : 0,
      positiveRate: rows.length ? packagePoints.filter((value) => value > 0).length / rows.length : 0,
      bonusHitRate: rows.length ? rows.filter((item) => item.positionBonus !== 0).length / rows.length : 0,
      bonusShare: rows.length
        ? rows.reduce((sum, item) => sum + Math.abs(item.positionBonus), 0)
          / Math.max(0.01, rows.reduce((sum, item) => sum + Math.abs(item.packagePoints), 0))
        : 0,
    }];
  }));
  const available = ROLES.map((role) => provisional[role]).filter((metric) => metric.samples >= 3);
  const referenceMean = average(available.map((metric) => metric.mean));
  const referenceP90 = average(available.map((metric) => metric.p90));
  return { metrics: provisional, referenceMean, referenceP90, availableRoles: available.map((item) => item.role) };
}

function formationMetrics(data, config) {
  const selectionsByLineup = new Map();
  for (const selection of data.selections) {
    const key = keyOfLineup(selection);
    const bucket = selectionsByLineup.get(key) ?? [];
    bucket.push(selection);
    selectionsByLineup.set(key, bucket);
  }
  const groups = new Map();
  for (const lineup of data.lineups) {
    if (!lineup.role_scoring_active || !["2-1-2", "2-2-1"].includes(lineup.formation)) continue;
    const selections = selectionsByLineup.get(keyOfLineup(lineup)) ?? [];
    if (!selections.length) continue;
    const playerTotal = selections.reduce((sum, row) => sum + simulatedSelection(row, config).total, 0);
    const prediction = (number(lineup.top_scorer_points) + number(lineup.top_assist_points)) * config.predictionScale
      + number(lineup.challenge_points) + number(lineup.card_points);
    const key = `${lineup.lineup_size}-${lineup.formation}`;
    const bucket = groups.get(key) ?? [];
    bucket.push((playerTotal + prediction) / Math.max(1, number(lineup.lineup_size)));
    groups.set(key, bucket);
  }
  const summaries = [...groups.entries()].map(([key, values]) => {
    const [size, formation] = key.split("-");
    return { size: number(size), formation, samples: values.length, meanPerSlot: average(values) };
  });
  let maxGap = 0;
  for (const size of [...new Set(summaries.map((item) => item.size))]) {
    const pair = summaries.filter((item) => item.size === size && item.samples >= 2);
    if (pair.length < 2) continue;
    const means = pair.map((item) => item.meanPerSlot);
    const gap = (Math.max(...means) - Math.min(...means)) / Math.max(0.01, Math.abs(average(means)));
    maxGap = Math.max(maxGap, gap);
  }
  return { summaries, maxGap };
}

function roleGrades(roleResult, formationGap) {
  const availableMetrics = roleResult.availableRoles.map((role) => roleResult.metrics[role]);
  const maxRatio = (metric, reference) => reference ? Math.abs(metric / reference - 1) : 1;
  return Object.fromEntries(ROLES.map((role) => {
    const metric = roleResult.metrics[role];
    if (metric.samples < 3 || !roleResult.referenceMean || !roleResult.referenceP90) {
      return [role, { score: null, components: null, confidence: "insuficiente" }];
    }
    const returnScore = deviationScore(maxRatio(metric.mean, roleResult.referenceMean));
    const opportunityScore = clamp(10 * (0.55 * Math.min(1, metric.positiveRate / 0.65)
      + 0.45 * Math.min(1, metric.bonusHitRate / 0.15)));
    const p90Score = deviationScore(maxRatio(metric.p90, roleResult.referenceP90), 0.2, 0.75);
    const extremeRatio = metric.p90 ? metric.max / Math.abs(metric.p90) : 10;
    const ceilingScore = clamp(p90Score - Math.max(0, extremeRatio - 2.5) * 1.5);
    const formationScore = deviationScore(formationGap, 0.05, 0.25);
    const clarityScore = ROLE_CLARITY[role].score;
    const score = returnScore * 0.30 + opportunityScore * 0.25 + ceilingScore * 0.20
      + formationScore * 0.15 + clarityScore * 0.10;
    const minimumSamples = Math.min(...availableMetrics.map((item) => item.samples));
    return [role, {
      score,
      components: { returnScore, opportunityScore, ceilingScore, formationScore, clarityScore },
      confidence: minimumSamples >= 30 ? "alta" : minimumSamples >= 10 ? "média" : "baixa",
    }];
  }));
}

function candidateConfigs(current) {
  const basePresets = [
    { goalPoints: current.goalPoints, assistPoints: current.assistPoints, winPoints: current.winPoints, lossPoints: current.lossPoints,
      goalkeeperAppearancePoints: current.goalkeeperAppearancePoints, goalConcededPoints: current.goalConcededPoints },
    { goalPoints: 5, assistPoints: 3, winPoints: 3.5, lossPoints: -1.5,
      goalkeeperAppearancePoints: 2.5, goalConcededPoints: -1 },
  ];
  const candidates = [];
  for (const base of basePresets)
    for (const goalkeeperCleanSheetBonus of [2, 3, 4])
      for (const defensiveBaseCleanBonus of [1, 1.5, 2])
        for (const defensiveSlotCleanBonus of [0.5, 1, 1.5])
          for (const midfieldAssistTotal of [3.5, 4])
            for (const midfieldMaestroBonus of [1, 2, 3])
              for (const attackerBraceBonus of [1, 2, 3])
                for (const captainMultiplier of [1.35, 1.4, 1.5])
                  for (const predictionScale of [0.7, 0.85, 1]) {
                    candidates.push({
                      ...current,
                      ...base,
                      goalkeeperCleanSheetBonus,
                      defensiveBaseCleanBonus,
                      defensiveBaseOneGoalBonus: defensiveBaseCleanBonus / 2,
                      defensiveSlotCleanBonus,
                      defensiveSlotOneGoalBonus: defensiveSlotCleanBonus / 2,
                      midfieldAssistTotal,
                      midfieldMaestroBonus,
                      attackerBraceBonus,
                      captainMultiplier,
                      predictionScale,
                    });
                  }
  return candidates;
}

function configDistance(candidate, current) {
  const keys = [
    "goalPoints", "assistPoints", "winPoints", "lossPoints", "goalkeeperAppearancePoints",
    "goalConcededPoints", "goalkeeperCleanSheetBonus", "defensiveBaseCleanBonus",
    "defensiveSlotCleanBonus", "midfieldAssistTotal", "midfieldMaestroBonus",
    "attackerBraceBonus", "captainMultiplier", "predictionScale",
  ];
  return average(keys.map((key) => Math.abs(number(candidate[key]) - number(current[key]))
    / Math.max(1, Math.abs(number(current[key])))));
}

function evaluateConfig(data, config, current) {
  const roles = roleMetrics(data, config);
  const available = roles.availableRoles.map((role) => roles.metrics[role]);
  if (available.length < 3) return { objective: Number.POSITIVE_INFINITY, roles, formation: formationMetrics(data, config) };
  const means = available.map((item) => item.mean);
  const p90s = available.map((item) => item.p90);
  const expectedGap = (Math.max(...means) - Math.min(...means)) / Math.max(0.01, Math.abs(average(means)));
  const p90Gap = (Math.max(...p90s) - Math.min(...p90s)) / Math.max(0.01, Math.abs(average(p90s)));
  const formation = formationMetrics(data, config);
  const change = configDistance(config, current);
  const objective = expectedGap * 2 + p90Gap + formation.maxGap * 2 + change * 0.35
    + Math.max(0, expectedGap - 0.15) * 8
    + Math.max(0, p90Gap - 0.20) * 5
    + Math.max(0, formation.maxGap - 0.05) * 8;
  return { objective, roles, formation, expectedGap, p90Gap, change };
}

function recommendConfig(data, current) {
  let best = null;
  for (const candidate of candidateConfigs(current)) {
    const evaluation = evaluateConfig(data, candidate, current);
    if (!best || evaluation.objective < best.evaluation.objective) best = { config: candidate, evaluation };
  }
  if (!best || !Number.isFinite(best.evaluation.objective)) {
    return {
      config: {
        ...current,
        goalkeeperCleanSheetBonus: 3,
        defensiveBaseCleanBonus: 1.5,
        defensiveBaseOneGoalBonus: 0.75,
        defensiveSlotCleanBonus: 1,
        defensiveSlotOneGoalBonus: 0.5,
        midfieldMaestroBonus: 2,
        attackerBraceBonus: 2,
        captainMultiplier: 1.4,
        predictionScale: 0.7,
      },
      evaluation: null,
      dataDriven: false,
    };
  }
  return { ...best, dataDriven: true };
}

function standingsImpact(data, proposed) {
  const selectionsByLineup = new Map();
  for (const selection of data.selections) {
    const bucket = selectionsByLineup.get(keyOfLineup(selection)) ?? [];
    bucket.push(selection);
    selectionsByLineup.set(keyOfLineup(selection), bucket);
  }
  const totals = new Map();
  for (const lineup of data.lineups) {
    const key = `${lineup.league_key}/${lineup.season_key}/${lineup.manager_key}`;
    const current = number(lineup.stored_total_points);
    const selections = selectionsByLineup.get(keyOfLineup(lineup)) ?? [];
    const proposedPlayers = selections.reduce((sum, selection) => sum + simulatedSelection(selection, proposed).total, 0);
    const proposedTotal = lineup.role_scoring_active
      ? proposedPlayers
        + (number(lineup.top_scorer_points) + number(lineup.top_assist_points)) * proposed.predictionScale
        + number(lineup.challenge_points) + number(lineup.card_points)
      : current;
    const previous = totals.get(key) ?? { key, managerKey: lineup.manager_key, current: 0, proposed: 0 };
    previous.current += current;
    previous.proposed += proposedTotal;
    totals.set(key, previous);
  }
  const rows = [...totals.values()];
  const rank = (field) => [...rows].sort((a, b) => b[field] - a[field] || a.managerKey - b.managerKey)
    .reduce((map, row, index) => map.set(row.key, index + 1), new Map());
  const currentRank = rank("current");
  const proposedRank = rank("proposed");
  return rows.map((row) => ({
    ...row,
    difference: row.proposed - row.current,
    currentRank: currentRank.get(row.key),
    proposedRank: proposedRank.get(row.key),
    rankChange: currentRank.get(row.key) - proposedRank.get(row.key),
  })).sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange) || Math.abs(b.difference) - Math.abs(a.difference));
}

function marketGrade(data) {
  const rows = data.performances.filter((row) => row.market_band && Number.isFinite(Number(row.variation_rate)));
  if (!rows.length) return { score: 8, samples: 0, capViolations: 0, roleGap: 0, source: "auditoria de código" };
  const capViolations = rows.filter((row) => number(row.variation_rate) > 0.12001 || number(row.variation_rate) < -0.10001).length;
  const roleMeans = ["defensive", "midfield", "offensive"].map((profile) =>
    average(rows.filter((row) => row.player_profile === profile).map((row) => number(row.variation_rate)))).filter(Number.isFinite);
  const roleGap = roleMeans.length >= 2 ? Math.max(...roleMeans) - Math.min(...roleMeans) : 0;
  const score = clamp(9 - (capViolations / rows.length) * 20 - Math.max(0, roleGap - 0.02) * 35);
  return { score, samples: rows.length, capViolations, roleGap, source: "dados reais + auditoria de código" };
}

function projectGrades(data, scoringScore, validation) {
  const market = marketGrade(data);
  const completeLineups = data.lineups.filter((lineup) =>
    lineup.captain_selected && [5, 6].includes(number(lineup.lineup_size))).length;
  const correctSelections = data.selections.filter((selection) =>
    !selection.role_scoring_active || selection.slot_role === "GOL" || selection.is_position_correct).length;
  const lineupCompletion = data.lineups.length ? completeLineups / data.lineups.length : 0;
  const slotIntegrity = data.selections.length ? correctSelections / data.selections.length : 0;
  const lineupScore = data.lineups.length ? clamp(10 * (lineupCompletion * 0.55 + slotIntegrity * 0.45)) : 8;
  const experienceScore = 8.5;
  const integrityScore = clamp((validation.successRate * 10) * 0.65 + 8 * 0.35);
  const overall = scoringScore * 0.35 + market.score * 0.20 + lineupScore * 0.20
    + experienceScore * 0.15 + integrityScore * 0.10;
  return { overall, market, lineupScore, experienceScore, integrityScore, lineupCompletion, slotIntegrity };
}

function scoringGrade(roleGradesResult, data, formation, validation) {
  const positionScores = ROLES.map((role) => roleGradesResult[role].score).filter((value) => value != null);
  const positionsScore = positionScores.length ? average(positionScores) : 0;
  const totalPoints = data.lineups.reduce((sum, row) => sum + Math.abs(number(row.stored_total_points)), 0);
  const metaPoints = data.lineups.reduce((sum, row) => sum + Math.abs(number(row.stored_prediction_points))
    + Math.abs(data.selections.filter((selection) => keyOfLineup(selection) === keyOfLineup(row))
      .reduce((inner, selection) => inner + number(selection.captain_bonus), 0)), 0);
  const metaShare = totalPoints ? metaPoints / totalPoints : 0;
  const captainPredictionScore = deviationScore(Math.max(0, metaShare - 0.2), 0.05, 0.35);
  const formationScore = deviationScore(formation.maxGap, 0.05, 0.25);
  const consistencyScore = validation.successRate * 10;
  return {
    overall: positionsScore * 0.50 + captainPredictionScore * 0.20 + formationScore * 0.20 + consistencyScore * 0.10,
    positionsScore,
    captainPredictionScore,
    formationScore,
    consistencyScore,
    metaShare,
  };
}

function imbalanceRanking(roleResult, formation, data) {
  const available = roleResult.availableRoles.map((role) => roleResult.metrics[role]);
  const items = [];
  for (const metric of available) {
    items.push({
      issue: `${metric.role}: retorno médio por jogo`,
      severity: roleResult.referenceMean ? Math.abs(metric.mean / roleResult.referenceMean - 1) : 1,
      detail: `${points(metric.mean)} pts/jogo contra referência ${points(roleResult.referenceMean)}.`,
    });
    items.push({
      issue: `${metric.role}: teto P90`,
      severity: roleResult.referenceP90 ? Math.abs(metric.p90 / roleResult.referenceP90 - 1) : 1,
      detail: `P90 ${points(metric.p90)} contra referência ${points(roleResult.referenceP90)}.`,
    });
  }
  items.push({ issue: "Vantagem estrutural entre formações", severity: formation.maxGap,
    detail: `Maior diferença observada por vaga: ${percent(formation.maxGap)}.` });
  const lineupTotal = data.lineups.reduce((sum, row) => sum + Math.abs(number(row.stored_total_points)), 0);
  const predictionTotal = data.lineups.reduce((sum, row) => sum + Math.abs(number(row.stored_prediction_points)), 0);
  items.push({ issue: "Peso dos palpites", severity: lineupTotal ? predictionTotal / lineupTotal : 0,
    detail: `${percent(lineupTotal ? predictionTotal / lineupTotal : 0)} dos pontos absolutos vieram de palpites/desafios.` });
  return items.sort((a, b) => b.severity - a.severity).slice(0, 10);
}

function recommendationRows(current, proposed) {
  return [
    ["Gol (base, todas as posições)", current.goalPoints, proposed.goalPoints],
    ["Assistência (base)", current.assistPoints, proposed.assistPoints],
    ["Vitória (base)", current.winPoints, proposed.winPoints],
    ["Derrota (base)", current.lossPoints, proposed.lossPoints],
    ["Atuação no gol (base)", current.goalkeeperAppearancePoints, proposed.goalkeeperAppearancePoints],
    ["Gol sofrido no gol (base)", current.goalConcededPoints, proposed.goalConcededPoints],
    ["GOL: clean sheet por jogo", current.goalkeeperCleanSheetBonus, proposed.goalkeeperCleanSheetBonus],
    ["DEF: clean na base", current.defensiveBaseCleanBonus, proposed.defensiveBaseCleanBonus],
    ["DEF: até 1 gol na base", current.defensiveBaseOneGoalBonus, proposed.defensiveBaseOneGoalBonus],
    ["DEF: clean na vaga", current.defensiveSlotCleanBonus, proposed.defensiveSlotCleanBonus],
    ["DEF: até 1 gol na vaga", current.defensiveSlotOneGoalBonus, proposed.defensiveSlotOneGoalBonus],
    ["MEI: total por assistência", current.midfieldAssistTotal, proposed.midfieldAssistTotal],
    ["MEI: Maestro (2+ assistências)", current.midfieldMaestroBonus, proposed.midfieldMaestroBonus],
    ["ATA: Artilheiro (2+ gols)", current.attackerBraceBonus, proposed.attackerBraceBonus],
    ["Capitão", `${current.captainMultiplier}x`, `${proposed.captainMultiplier}x`],
    ["Palpite de artilheiro", current.topScorerPredictionPoints,
      round2(proposed.topScorerPredictionPoints * proposed.predictionScale)],
    ["Palpite de garçom", current.topAssistPredictionPoints,
      round2(proposed.topAssistPredictionPoints * proposed.predictionScale)],
  ];
}

function scenarioRows(config) {
  const make = (slotRole, playerProfile, stats) => ({
    slot_role: slotRole,
    player_profile: playerProfile,
    is_position_correct: true,
    is_captain: false,
    role_scoring_active: true,
    games: 1,
    wins: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    own_goals: 0,
    goalkeeper_games: 0,
    clean_sheets: 0,
    goals_conceded: 0,
    defensive_clean_games: 0,
    defensive_one_goal_games: 0,
    ...stats,
  });
  const cases = [
    ["GOL", "Típico: 1 jogo no gol, vitória e 1 gol sofrido", make("GOL", "midfield", { wins: 1, goalkeeper_games: 1, goals_conceded: 1 })],
    ["GOL", "Extremo: 2 jogos no gol, 2 vitórias e 2 clean sheets", make("GOL", "midfield", { games: 2, wins: 2, goalkeeper_games: 2, clean_sheets: 2 })],
    ["DEF", "Típico: vitória e jogo com apenas 1 gol sofrido", make("DEF", "defensive", { wins: 1, defensive_one_goal_games: 1 })],
    ["DEF", "Extremo: gol, assistência, vitória e clean sheet", make("DEF", "defensive", { wins: 1, goals: 1, assists: 1, defensive_clean_games: 1 })],
    ["MEI", "Típico: vitória e 1 assistência", make("MEI", "midfield", { wins: 1, assists: 1 })],
    ["MEI", "Extremo: gol, vitória e 2 assistências", make("MEI", "midfield", { wins: 1, goals: 1, assists: 2 })],
    ["ATA", "Típico: vitória e 1 gol", make("ATA", "offensive", { wins: 1, goals: 1 })],
    ["ATA", "Extremo: vitória e 2 gols", make("ATA", "offensive", { wins: 1, goals: 2 })],
  ];
  return cases.map(([role, description, row]) => ({ role, description, points: simulatedSelection(row, config).total }));
}

function buildReport(payload) {
  const data = normalizePayload(payload);
  const latestRoleRound = [...data.rounds].reverse().find((round) => round.rules?.roleScoringActive) ?? data.rounds.at(-1);
  const current = currentConfigFromRound(latestRoleRound);
  const validation = validateStoredTotals(data);
  const currentRoles = roleMetrics(data, current);
  const currentFormation = formationMetrics(data, current);
  const grades = roleGrades(currentRoles, currentFormation.maxGap);
  const scoring = scoringGrade(grades, data, currentFormation, validation);
  const project = projectGrades(data, scoring.overall, validation);
  const recommendation = recommendConfig(data, current);
  const proposed = recommendation.config;
  const proposedEvaluation = recommendation.evaluation ?? evaluateConfig(data, proposed, current);
  const impact = standingsImpact(data, proposed);
  const imbalances = imbalanceRanking(currentRoles, currentFormation, data);
  const activeRounds = data.rounds.filter((round) => round.rules?.roleScoringActive).length;
  const legacyRounds = data.rounds.length - activeRounds;
  const confidence = Math.min(...ROLES.map((role) => currentRoles.metrics[role].samples || 0)) >= 30
    ? "alta" : Math.min(...ROLES.map((role) => currentRoles.metrics[role].samples || 0)) >= 10 ? "média" : "baixa";

  const lines = [];
  lines.push("# Auditoria de balanceamento do Cartola", "");
  lines.push(`Gerado em ${new Date().toLocaleString("pt-BR")}. A auditoria é somente leitura; nenhuma regra ou dado de produção foi alterado.`, "");
  lines.push("## Resumo executivo", "");
  lines.push(`- Nota do sistema de pontuação: **${grade(scoring.overall)}/10**.`);
  lines.push(`- Nota do projeto Cartola completo: **${grade(project.overall)}/10**.`);
  lines.push(`- Confiança estatística: **${confidence}** (${activeRounds} rodada(s) com posições e ${legacyRounds} rodada(s) legada(s)).`);
  lines.push(`- Integridade da recomposição: **${percent(validation.successRate)}** de ${validation.checked} verificações; ${validation.failures} divergência(s).`);
  lines.push(`- A proposta ${recommendation.dataDriven ? "foi escolhida por busca numérica no histórico" : "é preliminar por falta de amostra suficiente"} e não foi aplicada.`, "");

  lines.push("## Notas por posição", "");
  lines.push("| Posição | Nota | Amostra | Média/jogo | Mediana | P75 | P90 | Máximo | Zero | Negativo | Bônus no pacote | Confiança |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const role of ROLES) {
    const metric = currentRoles.metrics[role];
    const result = grades[role];
    lines.push(`| ${role} | ${result.score == null ? "—" : grade(result.score)} | ${metric.samples} | ${points(metric.mean)} | ${points(metric.median)} | ${points(metric.p75)} | ${points(metric.p90)} | ${points(metric.max)} | ${percent(metric.zeroRate)} | ${percent(metric.negativeRate)} | ${percent(metric.bonusShare)} | ${result.confidence} |`);
  }
  lines.push("");
  for (const role of ROLES) {
    const result = grades[role];
    lines.push(`- **${role}:** ${ROLE_CLARITY[role].note}${result.components
      ? ` Componentes — retorno ${grade(result.components.returnScore)}, oportunidade ${grade(result.components.opportunityScore)}, teto ${grade(result.components.ceilingScore)}, formação ${grade(result.components.formationScore)} e clareza ${grade(result.components.clarityScore)}.`
      : " Ainda não há pelo menos três escolhas válidas para fechar a nota."}`);
  }
  lines.push("");

  lines.push("## Ranking dos desequilíbrios", "");
  lines.push("| # | Risco | Gravidade relativa | Evidência |");
  lines.push("|---:|---|---:|---|");
  imbalances.forEach((item, index) => lines.push(`| ${index + 1} | ${markdownCell(item.issue)} | ${percent(item.severity)} | ${markdownCell(item.detail)} |`));
  lines.push("");

  lines.push("## Formações e tamanho da liga", "");
  lines.push("| Jogadores | Formação | Escalações | Média por vaga |");
  lines.push("|---:|---|---:|---:|");
  for (const item of currentFormation.summaries) {
    lines.push(`| ${item.size} | ${item.formation} | ${item.samples} | ${points(item.meanPerSlot)} |`);
  }
  if (!currentFormation.summaries.length) lines.push("| — | — | 0 | — |");
  lines.push("", `Maior vantagem estrutural observada: **${percent(currentFormation.maxGap)}**. Meta de aceitação: abaixo de 5%.`, "");

  lines.push("## Capitão, palpites e consistência", "");
  lines.push(`- Capitão + palpites/desafios representam **${percent(scoring.metaShare)}** dos pontos absolutos armazenados.`);
  lines.push(`- Nota do bloco capitão/palpites: **${grade(scoring.captainPredictionScore)}/10**.`);
  lines.push(`- Nota de consistência entre itens e total final: **${grade(scoring.consistencyScore)}/10**.`);
  lines.push("- Cartas continuam isoladas da proposta: seus pontos são preservados na simulação e não entram no preço de mercado.", "");

  const currentScenarios = scenarioRows(current);
  const proposedScenarios = scenarioRows(proposed);
  lines.push("## Cenários típicos e extremos", "");
  lines.push("Os valores abaixo excluem capitão, palpites e cartas para expor apenas o pacote da posição.", "");
  lines.push("| Posição | Cenário | Atual | Proposta |");
  lines.push("|---|---|---:|---:|");
  currentScenarios.forEach((scenario, index) => {
    lines.push(`| ${scenario.role} | ${scenario.description} | ${points(scenario.points)} | ${points(proposedScenarios[index].points)} |`);
  });
  lines.push("");

  lines.push("## Proposta numérica", "");
  lines.push("| Regra | Atual | Proposta |");
  lines.push("|---|---:|---:|");
  for (const row of recommendationRows(current, proposed)) lines.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`);
  lines.push("");
  if (proposedEvaluation && Number.isFinite(proposedEvaluation.objective)) {
    lines.push(`A simulação proposta ficou com diferença de retorno esperado de **${percent(proposedEvaluation.expectedGap)}**, diferença de P90 de **${percent(proposedEvaluation.p90Gap)}** e vantagem entre formações de **${percent(proposedEvaluation.formation.maxGap)}**.`, "");
  }
  lines.push("Classificação das mudanças:", "");
  lines.push("- **Indispensável:** corrigir qualquer divergência de recomposição antes de mexer nos pesos; reduzir parâmetros que ultrapassem as metas de 15%/20%/5%.");
  lines.push("- **Opcional:** suavizar vitória/derrota e reduzir o peso combinado de capitão e palpites quando a classificação depender demais de eventos binários.");
  lines.push("- **Manter:** snapshots por rodada, Rodada 1 separada, mercado 65% posição/35% geral e cartas fora da valorização.", "");

  lines.push("## Impacto histórico simulado", "");
  lines.push("A Rodada 1 permanece intocada. As linhas abaixo mostram as maiores mudanças anônimas nas temporadas exportadas.", "");
  lines.push("| Gestor | Pontos atuais | Pontos simulados | Diferença | Rank atual | Rank simulado | Variação |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of impact.slice(0, 15)) {
    lines.push(`| ${row.managerKey} | ${points(row.current)} | ${points(row.proposed)} | ${points(row.difference)} | ${row.currentRank} | ${row.proposedRank} | ${row.rankChange > 0 ? "+" : ""}${row.rankChange} |`);
  }
  if (!impact.length) lines.push("| — | — | — | — | — | — | — |");
  lines.push("");

  lines.push("## Nota geral do sistema de pontuação", "");
  lines.push("| Bloco | Peso | Nota |");
  lines.push("|---|---:|---:|");
  lines.push(`| Posições | 50% | ${grade(scoring.positionsScore)} |`);
  lines.push(`| Capitão e palpites | 20% | ${grade(scoring.captainPredictionScore)} |`);
  lines.push(`| Equilíbrio das formações | 20% | ${grade(scoring.formationScore)} |`);
  lines.push(`| Prévia/final e recomposição | 10% | ${grade(scoring.consistencyScore)} |`);
  lines.push(`| **Total** | **100%** | **${grade(scoring.overall)}** |`, "");

  lines.push("## Nota geral do projeto Cartola", "");
  lines.push("| Bloco | Peso | Nota | Base da avaliação |");
  lines.push("|---|---:|---:|---|");
  lines.push(`| Pontuação | 35% | ${grade(scoring.overall)} | Dados reais e regras |`);
  lines.push(`| Mercado/patrimônio | 20% | ${grade(project.market.score)} | ${project.market.source} |`);
  lines.push(`| Escalação e clareza | 20% | ${grade(project.lineupScore)} | Completude, capitão e vagas |`);
  lines.push(`| Experiência/rankings | 15% | ${grade(project.experienceScore)} | Auditoria funcional do projeto |`);
  lines.push(`| Integridade/testes | 10% | ${grade(project.integrityScore)} | Recomposição + proteções existentes |`);
  lines.push(`| **Total** | **100%** | **${grade(project.overall)}** | |`, "");

  lines.push("## Limites e próximos passos", "");
  lines.push("- Notas com confiança baixa não devem virar migration sem mais rodadas; o relatório sinaliza a amostra por posição.");
  lines.push("- A busca testa alternativas próximas das regras atuais, não combinações arbitrárias que descaracterizem o jogo.");
  lines.push("- Antes de qualquer aplicação, revisar manualmente os cenários extremos e executar a suíte de testes de prévia/final.");
  lines.push("- Este arquivo é uma recomendação: não cria migration, não chama o Supabase e não altera produção.", "");

  return { markdown: lines.join("\n"), validation, current, proposed, scoring, project, impact };
}

function selfTestPayload() {
  const rounds = [1, 2, 3, 4].map((roundNumber) => ({
    league_key: 1, season_key: 1, season_number: 1, round_number: roundNumber,
    players_per_team: 5,
    rules: { roleScoringActive: roundNumber >= 2, goalPoints: 5, assistPoints: 3, winPoints: 4,
      lossPoints: -2, goalkeeperAppearancePoints: 3, goalConcededPoints: -1, ownGoalPoints: -3,
      captainMultiplier: 1.5, goalkeeperCleanSheetBonus: 4, defensiveBaseCleanBonus: 2,
      defensiveBaseOneGoalBonus: 1, defensiveSlotCleanBonus: 2, defensiveSlotOneGoalBonus: 1,
      midfieldAssistTotal: 4, midfieldMaestroBonus: 3, attackerBraceBonus: 3 },
  }));
  const selections = [];
  const lineups = [];
  let lineupKey = 1;
  for (let roundNumber = 2; roundNumber <= 4; roundNumber += 1) {
    for (let managerKey = 1; managerKey <= 3; managerKey += 1) {
      const roles = managerKey % 2 ? ["ATA", "ATA", "MEI", "DEF", "DEF"] : ["ATA", "MEI", "MEI", "DEF", "DEF"];
      let playerTotal = 0;
      roles.forEach((slotRole, index) => {
        const profile = slotRole === "ATA" ? "offensive" : slotRole === "MEI" ? "midfield" : "defensive";
        const goals = slotRole === "ATA" && (roundNumber + index) % 3 === 0 ? 1 : 0;
        const assists = slotRole === "MEI" && (roundNumber + index) % 2 === 0 ? 1 : 0;
        const wins = (roundNumber + index + managerKey) % 2;
        const losses = wins ? 0 : 1;
        const defensiveClean = slotRole === "DEF" && wins ? 1 : 0;
        const base = goals * 5 + assists * 3 + wins * 4 + losses * -2 + defensiveClean * 2;
        const bonus = assists + defensiveClean * 2;
        const captain = index === 0 ? (base + bonus) * 0.5 : 0;
        const total = base + bonus + captain;
        playerTotal += total;
        selections.push({ league_key: 1, season_key: 1, round_number: roundNumber, lineup_key: lineupKey,
          manager_key: managerKey, player_key: lineupKey * 10 + index, slot_role: slotRole,
          player_profile: profile, is_position_correct: true, is_captain: index === 0,
          base_points: base, position_bonus: bonus, captain_bonus: captain, total_points: total,
          games: 1, wins, losses, goals, assists, own_goals: 0,
          goalkeeper_games: 0, clean_sheets: 0, goals_conceded: 0,
          defensive_clean_games: defensiveClean, defensive_one_goal_games: 0, role_scoring_active: true });
      });
      lineups.push({ league_key: 1, season_key: 1, round_number: roundNumber, lineup_key: lineupKey,
        manager_key: managerKey, lineup_size: 5, formation: managerKey % 2 ? "2-1-2" : "2-2-1",
        captain_selected: true, recomposed_player_points: playerTotal, stored_player_points: playerTotal,
        stored_prediction_points: 0, top_scorer_points: 0, top_assist_points: 0, challenge_points: 0,
        card_points: 0, stored_total_points: playerTotal, role_scoring_active: true });
      lineupKey += 1;
    }
  }
  return { schemaVersion: 1, rounds, lineups, selections, performances: [] };
}

async function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (inputArg === "--self-test") {
    const result = buildReport(selfTestPayload());
    if (result.validation.failures !== 0 || !result.markdown.includes("Nota geral do projeto Cartola")) {
      throw new Error("Autoteste falhou.");
    }
    console.log("Autoteste do analisador concluído sem divergências.");
    return;
  }
  if (!inputArg) {
    console.error("Uso: node scripts/analyze-cartola-balance.mjs <cartola-audit.json> [relatorio.md]");
    process.exitCode = 1;
    return;
  }
  const inputPath = resolve(inputArg);
  const outputPath = resolve(outputArg ?? "cartola-balance-report.md");
  const payload = parsePayload(await readFile(inputPath, "utf8"));
  const result = buildReport(payload);
  await writeFile(outputPath, `${result.markdown}\n`, "utf8");
  console.log(`Relatório criado em ${outputPath}`);
  console.log(`Recomposição: ${result.validation.failures} divergência(s) em ${result.validation.checked} verificações.`);
  console.log(`Nota da pontuação: ${grade(result.scoring.overall)}/10`);
  console.log(`Nota do projeto: ${grade(result.project.overall)}/10`);
}

await main();
