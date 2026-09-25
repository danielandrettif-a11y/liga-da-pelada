/** STAGED DOMAIN CODE. Do not expose these functions as client/server actions.
 * Approval + authenticated transactional adapter + future match engine required.
 */
import { cardPositions, executeCommand, ManagerRuleError, zeroRatings } from "@/lib/bq-manager/engine";
import { POSITIONS, type AthleteSource, type ManagerCommand, type ManagerState, type Position } from "@/lib/bq-manager/types";
import { DRAFT_BALANCE, FORMATION, REWARD_ROUNDS, VARZEA_ROUNDS } from "./balance";
import { tutorialCandidates } from "./recruitment";
import type { CareerDraft, DraftBalance, GenericPlayer, Lineup, MatchReport, PlayerRecord, Preparation } from "./types";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new ManagerRuleError(message);
};
const decimal = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
const emptyRecord = (): PlayerRecord => ({ games: 0, goals: 0, assists: 0, ratingTotal: 0 });
const emptyPreparation = (round: number): Preparation => ({ round, collective: null, individuals: [] });
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;

function validateBalance(balance: DraftBalance) {
  assert(Object.values(balance).every(n => Number.isFinite(n) && n >= 0), "Configuração de equilíbrio inválida.");
  for (const key of ["initialCoins", "matchIncome", "winBonus", "drawBonus", "collectiveCost", "individualCost", "standardPackCost", "genericSaleValue"] as const) {
    assert(whole(balance[key]), "Moedas precisam ser inteiras.");
  }
  assert(balance.trainingGain <= 12 && balance.matchGain <= 12 && balance.standardPackCost > 0, "Ganhos/custo inválidos.");
}

/** Nine fictional players with stable IDs: one goalkeeper, three defenders,
 * three midfielders and two attackers. This initializer must only run once.
 */
export function initializeCareer(collection: ManagerState, balance: DraftBalance = DRAFT_BALANCE): CareerDraft {
  validateBalance(balance);
  const names = ["Goleiro da Base", "Defensor 01", "Defensor 02", "Meia 01", "Meia 02", "Atacante 01", "Defensor 03", "Meia 03", "Atacante 02"];
  const roles: Position[] = [...FORMATION, "DEF", "ALA_MEI", "ATA"];
  const generics: GenericPlayer[] = names.map((name, index) => ({
    id: `generic-${index + 1}`, name,
    positions: { DEF: 45, ALA_MEI: 45, ATA: 45, GOL: 40, [roles[index]]: 55 }, training: zeroRatings(),
  }));
  return {
    draftVersion: 1, collection: structuredClone(collection), generics,
    coins: balance.initialCoins, round: 1, stage: "varzea", pendingMatch: null,
    lineup: { starters: generics.slice(0, 6).map((p, i) => ({ id: p.id, position: FORMATION[i] })), bench: generics.slice(6).map(p => p.id) },
    preparation: emptyPreparation(1), condition: Object.fromEntries(generics.map(p => [p.id, 100])),
    records: {}, matches: [], tutorialPackIds: [],
    ledger: [{ id: "career-start", amount: balance.initialCoins, reason: "Fundação do clube" }],
  };
}

function ensureIdle(state: CareerDraft) {
  assert(!state.pendingMatch, "Conclua a partida em andamento antes de alterar o clube.");
}

function roster(state: CareerDraft) {
  return [...state.generics.map(p => ({ id: p.id, identity: p.id })),
    ...state.collection.cards.map(p => ({ id: p.id, identity: `bq:${p.source.playerId}` }))];
}

export function validateLineup(state: CareerDraft, lineup: Lineup): void {
  assert(lineup && Array.isArray(lineup.starters) && Array.isArray(lineup.bench), "Escalação inválida.");
  assert(lineup.starters.length === 6 && lineup.bench.length === 3, "Relacione seis titulares e três reservas.");
  const ids = [...lineup.starters.map(p => p.id), ...lineup.bench];
  assert(new Set(ids).size === 9, "Não repita uma carta na escalação.");
  const players = ids.map(id => roster(state).find(p => p.id === id));
  assert(players.every(Boolean), "Você só pode escalar atletas do seu clube.");
  assert(new Set(players.map(p => p!.identity)).size === 9, "O mesmo atleta BQ não pode aparecer duas vezes entre os nove.");
  assert(lineup.starters.every(p => POSITIONS.includes(p.position)), "Posição inválida.");
  for (const position of POSITIONS) {
    assert(lineup.starters.filter(p => p.position === position).length === FORMATION.filter(p => p === position).length, "Use GOL, dois DEF, dois ALA/MEI e um ATA.");
  }
}

export function setLineup(state: CareerDraft, lineup: Lineup): CareerDraft {
  ensureIdle(state); validateLineup(state, lineup);
  return { ...structuredClone(state), lineup: structuredClone(lineup) };
}

function entry(state: CareerDraft, amount: number, id: string, reason: string) {
  assert(Number.isSafeInteger(amount) && Number.isSafeInteger(state.coins + amount) && state.coins + amount >= 0, "Saldo insuficiente ou valor inválido.");
  assert(!state.ledger.some(row => row.id === id), "Esta operação já foi registrada.");
  state.coins += amount;
  state.ledger.push({ id, amount, reason });
}

/** Increase the shared training+games progression budget, not the immutable source. */
function gain(state: CareerDraft, id: string, position: Position, amount: number) {
  const card = state.collection.cards.find(p => p.id === id);
  const generic = state.generics.find(p => p.id === id);
  const training = card?.training || generic?.training;
  assert(training, "Atleta não encontrado.");
  const value = card ? cardPositions(card)[position] : generic!.positions[position] + generic!.training[position];
  const increase = decimal(Math.max(0, Math.min(amount, 12 - training[position], 99 - value)));
  training[position] = decimal(training[position] + increase);
  if (card && increase > 0) {
    const attribute = { DEF: "defense", ALA_MEI: "passing", ATA: "finishing", GOL: "physical" } as const;
    card.attributes[attribute[position]] = decimal(Math.min(99, card.attributes[attribute[position]] + increase));
  }
}

/** One collective and two distinct individual sessions, per official round.
 * Recovery has zero coin cost to avoid an economy/condition deadlock.
 */
export function train(
  state: CareerDraft, focus: Position | "recovery", playerId?: string, balance: DraftBalance = DRAFT_BALANCE,
): CareerDraft {
  ensureIdle(state); validateBalance(balance);
  assert(state.round <= VARZEA_ROUNDS && state.stage === "varzea", "A preparação da Várzea já foi concluída.");
  assert(focus === "recovery" || POSITIONS.includes(focus), "Foco inválido.");
  assert(state.preparation.round === state.round, "Preparação de outra rodada.");
  const next = structuredClone(state);
  let ids: string[];
  if (playerId !== undefined) {
    assert(roster(next).some(p => p.id === playerId), "Atleta não pertence ao clube.");
    assert(next.preparation.individuals.length < 2 && !next.preparation.individuals.some(p => p.id === playerId), "Use no máximo dois focos individuais, um por atleta.");
    ids = [playerId];
    next.preparation.individuals.push({ id: playerId, focus });
  } else {
    assert(next.preparation.collective === null, "O foco coletivo desta rodada já foi utilizado.");
    // Related nine only, not unlimited duplicate inventory training.
    validateLineup(next, next.lineup);
    ids = [...next.lineup.starters.map(p => p.id), ...next.lineup.bench];
    next.preparation.collective = focus;
  }
  const cost = focus === "recovery" ? 0 : playerId === undefined ? balance.collectiveCost : balance.individualCost;
  entry(next, -cost, `training:${next.round}:${playerId ?? "collective"}`, `Preparação ${focus}`);
  for (const id of ids) {
    if (focus === "recovery") next.condition[id] = Math.min(100, (next.condition[id] ?? 100) + balance.focusRecovery);
    else gain(next, id, focus, balance.trainingGain);
  }
  return next;
}

export function preparationBonus(state: CareerDraft, id: string, position: Position, balance: DraftBalance = DRAFT_BALANCE): number {
  if (state.preparation.round !== state.round) return 0;
  const related = [...state.lineup.starters.map(p => p.id), ...state.lineup.bench].includes(id);
  const collective = related && state.preparation.collective === position;
  const individual = state.preparation.individuals.some(p => p.id === id && p.focus === position);
  return collective || individual ? balance.preparationBonus : 0;
}

/** Server-generated ID. Must be persisted before calling the phase-3 simulator. */
export function beginMatch(state: CareerDraft, ticketId: string): CareerDraft {
  if (state.pendingMatch) {
    assert(state.pendingMatch.id === ticketId, "Retome a partida existente; não gere outro resultado.");
    return structuredClone(state);
  }
  assert(state.stage === "varzea" && state.round <= VARZEA_ROUNDS, "A Várzea foi concluída.");
  assert(typeof ticketId === "string" && ticketId.length > 0 && !state.matches.some(p => p.ticketId === ticketId), "Identificador de partida inválido ou já utilizado.");
  validateLineup(state, state.lineup);
  const next = structuredClone(state);
  next.pendingMatch = { id: ticketId, round: state.round, lineup: structuredClone(state.lineup), preparation: structuredClone(state.preparation) };
  return next;
}

function validateReport(state: CareerDraft, report: MatchReport) {
  const ticket = state.pendingMatch;
  assert(ticket && ticket.id === report.ticketId && ticket.round === state.round, "Resultado não corresponde à partida em andamento.");
  assert(whole(report.goalsFor) && whole(report.goalsAgainst), "Placar inválido.");
  const related = [...ticket.lineup.starters.map(p => p.id), ...ticket.lineup.bench];
  assert(Array.isArray(report.players) && report.players.length >= 6 && report.players.length <= 9, "Relatório de atletas incompleto.");
  assert(new Set(report.players.map(p => p.id)).size === report.players.length, "Atleta repetido no relatório.");
  assert(ticket.lineup.starters.every(p => report.players.some(row => row.id === p.id)), "Faltam titulares no relatório.");
  for (const player of report.players) {
    assert(related.includes(player.id) && POSITIONS.includes(player.position), "Atleta ou posição inválida no relatório.");
    assert(Number.isFinite(player.minutes) && player.minutes >= 0 && player.minutes <= 90, "Minutagem inválida.");
    assert(whole(player.goals) && whole(player.assists) && Number.isFinite(player.rating) && player.rating >= 0 && player.rating <= 10, "Estatísticas inválidas.");
    assert(player.minutes > 0 || (player.goals === 0 && player.assists === 0 && player.rating === 0), "Atleta sem minutos não pode ter scouts.");
  }
  const minutesTotal = report.players.reduce((n, p) => n + p.minutes, 0);
  assert(minutesTotal > 0 && minutesTotal <= 540, "Minutagem total inválida para seis atletas por 90 minutos.");
  assert(report.players.reduce((n, p) => n + p.goals, 0) <= report.goalsFor && report.players.reduce((n, p) => n + p.assists, 0) <= report.goalsFor, "Scouts incompatíveis com o placar.");
}

function reportFingerprint(report: MatchReport): string {
  return JSON.stringify({
    ticketId: report.ticketId, goalsFor: report.goalsFor, goalsAgainst: report.goalsAgainst,
    players: [...report.players].sort((a, b) => a.id.localeCompare(b.id)).map(p => ({
      id: p.id, position: p.position, minutes: p.minutes, goals: p.goals, assists: p.assists, rating: p.rating,
    })),
  });
}

/** Trusted simulator output ONLY. Never accept a MatchReport from the browser.
 * This function neither simulates a match nor authorizes a result.
 */
export function settleMatch(state: CareerDraft, report: MatchReport, balance: DraftBalance = DRAFT_BALANCE): CareerDraft {
  validateBalance(balance);
  const previous = state.matches.find(p => p.ticketId === report.ticketId);
  if (previous) {
    assert(reportFingerprint(previous) === reportFingerprint(report), "Esta partida já tem um resultado definitivo.");
    return structuredClone(state);
  }
  validateReport(state, report);
  const next = structuredClone(state);
  const income = balance.matchIncome + (report.goalsFor > report.goalsAgainst ? balance.winBonus : report.goalsFor === report.goalsAgainst ? balance.drawBonus : 0);
  entry(next, income, `match:${report.ticketId}`, `Várzea · rodada ${state.round}`);
  next.matches.push({ ...structuredClone(report), round: state.round });
  for (const player of roster(next)) {
    const played = report.players.find(p => p.id === player.id);
    const minutes = played?.minutes ?? 0;
    const fatigue = balance.matchFatigue * minutes / 90;
    next.condition[player.id] = decimal(Math.max(0, Math.min(100, (next.condition[player.id] ?? 100) - fatigue + balance.roundRecovery)));
    if (played && minutes > 0) {
      const record = next.records[player.id] ?? emptyRecord();
      record.games += 1; record.goals += played.goals; record.assists += played.assists; record.ratingTotal = decimal(record.ratingTotal + played.rating);
      next.records[player.id] = record;
      if (minutes >= 30) gain(next, player.id, played.position, balance.matchGain);
    }
  }
  if (REWARD_ROUNDS.some(round => round === state.round)) {
    const id = `varzea-reward:${state.round}`;
    const first = state.round === REWARD_ROUNDS[0];
    next.collection.packs.push({ id, kind: first ? "choice" : "guaranteed", label: first ? "Sua primeira contratação BQ" : `Reforço BQ · rodada ${state.round}`, bound: true, status: "sealed", offers: [] });
    next.tutorialPackIds.push(id);
  }
  next.pendingMatch = null;
  next.round += 1;
  next.preparation = emptyPreparation(next.round);
  return next;
}

/** Wrap phase-1 mutations when integration is approved so all operations see
 * the same career aggregate and cannot remove a related/training card.
 */
export function changeCollection(
  state: CareerDraft, command: ManagerCommand,
  context: { catalog: AthleteSource[]; now: string; newId: () => string; random: () => number },
): CareerDraft {
  ensureIdle(state);
  let pool = context.catalog;
  const tutorialComplete = state.tutorialPackIds.length === 6 && state.tutorialPackIds.every(id => state.collection.packs.find(p => p.id === id)?.status === "claimed");
  if (command.type === "fuse") {
    const related = [...state.lineup.starters.map(p => p.id), ...state.lineup.bench, ...state.preparation.individuals.map(p => p.id)];
    assert(command.donorIds.every(id => !related.includes(id)), "Retire as doadoras da escalação e da preparação antes de consumir.");
    const tutorialCards = state.collection.packs.filter(p => state.tutorialPackIds.includes(p.id)).map(p => p.claimedCardId);
    assert(tutorialComplete || command.donorIds.every(id => !tutorialCards.includes(id)), "Preserve as cartas de recompensa até concluir as seis contratações.");
  }
  if (command.type === "open-pack" && !state.tutorialPackIds.includes(command.packId)) {
    assert(tutorialComplete, "Conclua as seis contratações antes de abrir pacotes comuns.");
  }
  if (command.type === "open-pack" && state.tutorialPackIds.includes(command.packId)) {
    // Claim tutorial rewards in order, but unrelated packs stay available.
    const index = state.tutorialPackIds.indexOf(command.packId);
    assert(state.tutorialPackIds.slice(0, index).every(id => state.collection.packs.find(p => p.id === id)?.status === "claimed"), "Escolha as recompensas da Várzea em ordem.");
    const selected = state.collection.packs.filter(p => state.tutorialPackIds.includes(p.id) && p.status === "claimed")
      .flatMap(p => state.collection.cards.filter(c => c.id === p.claimedCardId).map(c => c.source));
    // Use all owned distinct players too: standard packs must not exhaust the
    // guaranteed pool. Already discovered athletes cannot be awarded again.
    const available = pool.filter(p => !state.collection.discovered.some(d => d.playerId === p.playerId));
    pool = tutorialCandidates(selected, available);
  }
  const next = structuredClone(state);
  next.collection = executeCommand(state.collection, command, { ...context, catalog: pool });
  assert(new Set(roster(next).map(p => p.identity)).size >= 9, "Preserve nove atletas distintos no clube.");
  return next;
}

export function buyPack(state: CareerDraft, operationId: string, balance: DraftBalance = DRAFT_BALANCE): CareerDraft {
  ensureIdle(state); validateBalance(balance);
  // A trusted persisted command ID is an idempotency key, never random per retry.
  const key = `buy:${operationId}`;
  if (state.ledger.some(row => row.id === key)) return structuredClone(state);
  assert(operationId.length > 0 && !state.collection.packs.some(p => p.id === key), "Operação inválida.");
  // Defer normal purchases until the six protected tutorial rewards are claimed,
  // otherwise discovering a scarce role could exhaust the guaranteed pool.
  assert(state.tutorialPackIds.length === 6 && state.tutorialPackIds.every(id => state.collection.packs.find(p => p.id === id)?.status === "claimed"), "Conclua as seis contratações da Várzea antes de comprar pacotes.");
  const next = structuredClone(state);
  entry(next, -balance.standardPackCost, key, "Pacote BQ");
  next.collection.packs.push({ id: key, kind: "standard", label: "Pacote BQ", bound: false, status: "sealed", offers: [] });
  return next;
}

export function sellGeneric(state: CareerDraft, playerId: string, balance: DraftBalance = DRAFT_BALANCE): CareerDraft {
  ensureIdle(state); validateBalance(balance);
  const key = `sale:${playerId}`;
  if (state.ledger.some(row => row.id === key)) return structuredClone(state);
  assert(state.generics.some(p => p.id === playerId), "Somente genéricos do seu clube podem ser vendidos ao sistema.");
  assert(![...state.lineup.starters.map(p => p.id), ...state.lineup.bench, ...state.preparation.individuals.map(p => p.id)].includes(playerId), "Retire o atleta da escalação e da preparação antes de vender.");
  const next = structuredClone(state);
  next.generics = next.generics.filter(p => p.id !== playerId);
  assert(new Set(roster(next).map(p => p.identity)).size >= 9, "A venda deixaria o clube com menos de nove atletas distintos.");
  entry(next, balance.genericSaleValue, key, "Venda de genérico ao sistema");
  // Club records remain; only active condition disappears.
  delete next.condition[playerId];
  return next;
}

export function seriesDReadiness(state: CareerDraft): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (state.matches.length < VARZEA_ROUNDS) reasons.push("Conclua as oito partidas da Várzea.");
  const distinct = [...new Map(state.collection.cards.map(c => [c.source.playerId, c.source])).values()];
  if (distinct.length < 6) reasons.push("Tenha pelo menos seis atletas BQ distintos no clube.");
  if (state.tutorialPackIds.length !== 6 || state.tutorialPackIds.some(id => state.collection.packs.find(p => p.id === id)?.status !== "claimed")) reasons.push("Escolha as seis recompensas da Várzea.");
  try { validateLineup(state, state.lineup); } catch { reasons.push("Ajuste os nove relacionados."); }
  if (state.pendingMatch) reasons.push("Conclua a partida em andamento.");
  return { ready: reasons.length === 0, reasons };
}

export function finishVarzea(state: CareerDraft): CareerDraft {
  const status = seriesDReadiness(state);
  assert(status.ready, status.reasons.join(" "));
  return { ...structuredClone(state), stage: "ready-for-serie-d" };
}
