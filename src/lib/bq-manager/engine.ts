import { getOverallComposition } from "@/lib/overall-explanation";
import { POSITIONS, type AthleteSource, type ClubIdentity, type ManagerCard, type ManagerCommand, type ManagerState, type Position, type Ratings, type Trend } from "./types";

export class ManagerRuleError extends Error {}
export const POSITION_LABELS: Record<Position, string> = { DEF: "DEF", ALA_MEI: "ALA/MEI", ATA: "ATA", GOL: "GOL" };
export const zeroRatings = (): Ratings => ({ DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 });
const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new ManagerRuleError(message);
};

export function validateIdentity(input: ClubIdentity): ClubIdentity {
  assert(input && typeof input === "object", "Informe os dados do clube.");
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const abbreviation = typeof input.abbreviation === "string" ? input.abbreviation.trim().toUpperCase() : "";
  assert(name.length >= 3 && name.length <= 32, "O nome precisa ter de 3 a 32 caracteres.");
  assert(/^[A-Z0-9]{2,4}$/.test(abbreviation), "Use uma sigla de 2 a 4 letras ou números.");
  assert(/^#[0-9a-f]{6}$/i.test(input.color), "Escolha uma cor válida.");
  assert(input.crest === "shield" || input.crest === "round", "Escolha um escudo válido.");
  assert(input.kit === "solid" || input.kit === "stripes", "Escolha um uniforme válido.");
  return { name, abbreviation, color: input.color, crest: input.crest, kit: input.kit };
}

export function newManagerState(club: ClubIdentity): ManagerState {
  return { schemaVersion: 1, club: validateIdentity(club), cards: [], discovered: [], packs: [] };
}

export function cardPositions(card: ManagerCard): Ratings {
  return Object.fromEntries(POSITIONS.map(position => [position, round(Math.min(99,
    card.source.positions[position] + card.inherited[position] + card.training[position] + card.fusion[position],
  ))])) as Ratings;
}

export function composedOverall(source: AthleteSource, positions: Ratings): number {
  if (source.formula === "adaptive-v12-top-three-progression" || source.formula === "adaptive-v13-admin-style-evidence") {
    const composition = getOverallComposition(source.traits, positions, { goalkeeperGames: source.goalkeeperEligible ? 8 : 0 });
    assert(composition, "Esta carta ainda não tem posições válidas para calcular o OVR.");
    return round(composition.value);
  }
  const roles = [...new Set(source.traits)].map((trait) => trait === "defensive" ? "DEF" : trait === "offensive" ? "ATA" : "ALA_MEI");
  const values = roles.map((role) => positions[role]).sort((left, right) => right - left);
  assert(values.length > 0, "Esta carta ainda não tem características válidas para calcular o OVR.");
  const weights = values.length === 1 ? [1] : values.length === 2 ? [.7, .3] : [.6, .25, .15];
  const lineOverall = values.reduce((total, value, index) => total + value * weights[index], 0);
  return round(source.goalkeeperEligible ? Math.max(lineOverall, positions.GOL) : lineOverall);
}

export function cardOverall(card: ManagerCard): number {
  // Preserve the exact public OVR at acquisition, including source rounding.
  // Once upgraded, apply the formula frozen in the card source to the new positions.
  const upgraded = POSITIONS.some(p => card.inherited[p] + card.training[p] + card.fusion[p] > 0);
  return upgraded ? composedOverall(card.source, cardPositions(card)) : card.source.overall;
}

export function formBonus(trend?: Trend): number {
  return trend === "rising" ? 2 : trend === "falling" ? -2 : 0;
}

export function createCard(source: AthleteSource, id: string, acquiredAt: string, bound: boolean): ManagerCard {
  assert(source.traits.length > 0 && POSITIONS.every(p => Number.isFinite(source.positions[p]) && source.positions[p] >= 40 && source.positions[p] <= 99), "A origem desta carta é inválida.");
  const positions = source.positions;
  return {
    id, source: structuredClone(source), acquiredAt, bound,
    inherited: zeroRatings(), training: zeroRatings(), fusion: zeroRatings(),
    // Initial draft only. These are game estimates, not measured real-life speed/fitness.
    attributes: {
      finishing: positions.ATA, passing: positions.ALA_MEI, defense: positions.DEF,
      speed: round((positions.ATA + positions.ALA_MEI) / 2),
      physical: round((positions.DEF + positions.ALA_MEI) / 2),
    },
    attributesReviewed: false,
  };
}

function sample<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (pool.length && result.length < count) {
    const value = random();
    assert(Number.isFinite(value) && value >= 0 && value < 1, "Sorteio indisponível.");
    result.push(pool.splice(Math.floor(value * pool.length), 1)[0]);
  }
  return result;
}

export function fusionPreview(state: ManagerState, command: Extract<ManagerCommand, { type: "fuse" }>) {
  assert(POSITIONS.includes(command.position), "Escolha uma posição válida.");
  assert(command.mode === "inherit" || command.mode === "four", "Escolha um tipo de evolução válido.");
  assert(Array.isArray(command.donorIds), "Selecione as cartas que serão consumidas.");
  const target = state.cards.find(card => card.id === command.targetId);
  assert(target, "A carta principal não pertence ao seu clube.");
  const expected = command.mode === "inherit" ? 1 : 4;
  assert(command.donorIds.length === expected && new Set(command.donorIds).size === expected, `Selecione ${expected} cópia(s) diferente(s).`);
  assert(!command.donorIds.includes(target.id), "A carta principal não pode ser consumida.");
  const donors = command.donorIds.map(id => state.cards.find(card => card.id === id));
  assert(donors.every(card => card && card.source.playerId === target.source.playerId), "Use apenas cópias do mesmo atleta que pertençam ao seu clube.");
  const positions = cardPositions(target);
  const upgraded = structuredClone(target);
  if (command.mode === "inherit") {
    const value = donors[0]!.source.positions[command.position];
    assert(value > positions[command.position], "A nota ORIGINAL da doadora precisa superar a nota atual nesta posição.");
    // Raise current permanent rating TO the donor's source rating, without stacking existing gains twice.
    upgraded.inherited[command.position] = round(upgraded.inherited[command.position] + value - positions[command.position]);
  } else {
    assert(Object.values(target.fusion).reduce((sum, value) => sum + value, 0) + 2 <= 8, "Esta carta já atingiu o limite total de +8 por fusões.");
    assert(donors.every(card => POSITIONS.every(p => card!.source.positions[p] <= positions[p])), "Uma doadora tem posição original superior. Use a herança ou escolha outra cópia.");
    assert(positions[command.position] + 2 <= 99, "Esta posição não comporta +2 sem ultrapassar 99.");
    upgraded.fusion[command.position] += 2;
  }
  // Future market must not launder a bound reward through a tradeable card.
  upgraded.bound = target.bound || donors.some(card => card!.bound);
  return { card: upgraded, before: positions[command.position], after: cardPositions(upgraded)[command.position], overall: cardOverall(upgraded) };
}

/** Pure transition; production provides server randomness, IDs and trusted catalog. */
export function executeCommand(
  state: ManagerState,
  command: ManagerCommand,
  context: { catalog: AthleteSource[]; now: string; newId: () => string; random: () => number },
): ManagerState {
  assert(state.schemaVersion === 1, "Esta versão do jogo precisa ser atualizada.");
  assert(command && typeof command === "object", "Ação inválida.");
  const next = structuredClone(state);
  if (command.type === "fuse") {
    const preview = fusionPreview(state, command);
    next.cards = next.cards.filter(card => !command.donorIds.includes(card.id)).map(card => card.id === command.targetId ? preview.card : card);
    return next;
  }
  assert(command.type === "open-pack" || command.type === "claim-pack", "Ação inválida.");
  const pack = next.packs.find(item => item.id === command.packId);
  assert(pack, "Este pacote não pertence ao seu clube.");
  if (command.type === "open-pack") {
    // A repeated request returns the same persisted offer, never a reroll.
    if (pack.status !== "sealed") return next;
    assert(!next.packs.some(item => item.id !== pack.id && item.status === "offered"), "Conclua a escolha do pacote aberto antes de abrir outro.");
    let pool = [...new Map(context.catalog.map(source => [source.playerId, source])).values()];
    if (pack.kind !== "standard") {
      const discovered = new Set(next.discovered.map(source => source.playerId));
      pool = pool.filter(source => !discovered.has(source.playerId));
    }
    if (pack.preferredPosition) {
      const position = pack.preferredPosition;
      const traits = { DEF: "defensive", ALA_MEI: "midfield", ATA: "offensive", GOL: null } as const;
      pool = pool.filter(source => position === "GOL" ? source.goalkeeperEligible : source.traits.includes(traits[position]!));
    }
    const count = pack.kind === "choice" ? 3 : 1;
    assert(pool.length >= count, "Ainda não há atletas elegíveis suficientes. Seu pacote foi preservado.");
    pack.offers = structuredClone(sample(pool, count, context.random));
    pack.status = "offered";
    return next;
  }
  if (pack.status === "claimed") return next;
  assert(pack.status === "offered", "Abra o pacote primeiro.");
  const source = pack.offers.find(offer => offer.playerId === command.playerId);
  assert(source, "Escolha uma das cartas oferecidas neste pacote.");
  if (pack.kind !== "standard") {
    assert(!next.discovered.some(item => item.playerId === source.playerId), "Este atleta já foi descoberto. Escolha outro pacote antes de continuar.");
  }
  const card = createCard(source, context.newId(), context.now, pack.bound);
  next.cards.push(card);
  if (!next.discovered.some(item => item.playerId === source.playerId)) next.discovered.push(structuredClone(source));
  pack.status = "claimed";
  pack.claimedCardId = card.id;
  return next;
}
