export const POSITIONS = ["DEF", "ALA_MEI", "ATA", "GOL"] as const;
export type Position = typeof POSITIONS[number];
export type Ratings = Record<Position, number>;
export type Trend = "rising" | "steady" | "falling";
export type AthleteSource = {
  playerId: string; name: string; avatarUrl: string | null; snapshotId: string; formula: string;
  capturedAt: string; overall: number; positions: Ratings; traits: Array<"defensive" | "midfield" | "offensive">;
  goalkeeperEligible: boolean; trend: Trend; stats: { rounds: number; goals: number; assists: number };
};
export type ClubIdentity = { name: string; abbreviation: string; color: string; crest: "shield" | "round"; kit: "solid" | "stripes" };
export type ManagerCard = {
  id: string; source: AthleteSource; acquiredAt: string; inherited: Ratings; training: Ratings; fusion: Ratings;
  attributes: Record<"finishing" | "passing" | "defense" | "speed" | "physical", number>;
  attributesReviewed: boolean; bound: boolean;
};
export type ManagerPack = {
  id: string; kind: "choice" | "guaranteed" | "standard"; label: string; bound: boolean;
  preferredPosition?: Position; status: "sealed" | "offered" | "claimed"; offers: AthleteSource[]; claimedCardId?: string;
};
export type ManagerState = { schemaVersion: 1; club: ClubIdentity; cards: ManagerCard[]; discovered: AthleteSource[]; packs: ManagerPack[] };
export type ManagerSave = { version: number; state: ManagerState };
export type ManagerCommand =
  | { type: "open-pack"; packId: string }
  | { type: "claim-pack"; packId: string; playerId: string }
  | { type: "fuse"; targetId: string; donorIds: string[]; position: Position; mode: "inherit" | "four" };
export type ManagerResult = { ok: true; save: ManagerSave; message: string } | { ok: false; message: string };

export class ManagerRuleError extends Error {}
const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new ManagerRuleError(message);
};
export const zeroRatings = (): Ratings => ({ DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 });

export function validateClubIdentity(input: Partial<ClubIdentity>): { valid: boolean; value?: ClubIdentity; error?: string } {
  try {
    assert(input && typeof input === "object", "Informe os dados do clube.");
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    const abbreviation = typeof input.abbreviation === "string" ? input.abbreviation.trim().toUpperCase() : "";
    assert(name.length >= 3 && name.length <= 32, "O nome precisa ter de 3 a 32 caracteres.");
    assert(/^[A-Z0-9]{2,4}$/.test(abbreviation), "Use uma sigla de 2 a 4 letras ou números.");
    assert(typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color), "Escolha uma cor válida.");
    assert(input.crest === "shield" || input.crest === "round", "Escolha um escudo válido.");
    assert(input.kit === "solid" || input.kit === "stripes", "Escolha um uniforme válido.");
    return { valid: true, value: { name, abbreviation, color: input.color, crest: input.crest, kit: input.kit } };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Dados do clube inválidos." };
  }
}

export function newManagerState(input: ClubIdentity): ManagerState {
  const identity = validateClubIdentity(input);
  if (!identity.valid || !identity.value) throw new ManagerRuleError(identity.error || "Dados do clube inválidos.");
  return { schemaVersion: 1, club: identity.value, cards: [], discovered: [], packs: [] };
}

export function cardPositions(card: ManagerCard): Ratings {
  return Object.fromEntries(POSITIONS.map((position) => [position, round(Math.min(99,
    card.source.positions[position] + card.inherited[position] + card.training[position] + card.fusion[position],
  ))])) as Ratings;
}

export function composedOverall(source: AthleteSource, positions: Ratings): number {
  if (["adaptive-v17-three-positions-column-c", "adaptive-v18-fluid-profile", "adaptive-v19-admin-fixed-profile", "adaptive-v20-statistical-confidence"].includes(source.formula)) {
    const entries = [positions.DEF, positions.ATA];
    if (source.goalkeeperEligible) entries.push(positions.GOL);
    entries.sort((a, b) => b - a);
    const weights = entries.length === 3 ? [.5, .35, .15] : [.7, .3];
    return round(entries.reduce((total, value, index) => total + value * weights[index]!, 0));
  }
  if (["adaptive-v12-top-three-progression", "adaptive-v13-admin-style-evidence", "adaptive-v14-role-adjusted-rates", "adaptive-v15-goalkeeper-outcomes", "adaptive-v16-distributed-trait-bonus"].includes(source.formula)) {
    const entries = [positions.DEF, positions.ALA_MEI, positions.ATA];
    if (source.goalkeeperEligible) entries.push(positions.GOL);
    entries.sort((a, b) => b - a);
    return round(entries.slice(0, 3).reduce((total, value, index) => total + value * [.5, .35, .15][index]!, 0));
  }
  const roles = [...new Set(source.traits)].map((trait) => trait === "defensive" ? "DEF" : trait === "offensive" ? "ATA" : "ALA_MEI") as Position[];
  const values = roles.map((role) => positions[role]).sort((a, b) => b - a);
  assert(values.length > 0, "Esta carta ainda não tem características válidas para calcular o OVR.");
  const weights = values.length === 1 ? [1] : values.length === 2 ? [.7, .3] : [.6, .25, .15];
  const lineOverall = values.reduce((total, value, index) => total + value * weights[index]!, 0);
  return round(source.goalkeeperEligible ? Math.max(lineOverall, positions.GOL) : lineOverall);
}

function cardOverall(card: ManagerCard) {
  return POSITIONS.some((position) => card.inherited[position] + card.training[position] + card.fusion[position] > 0)
    ? composedOverall(card.source, cardPositions(card)) : card.source.overall;
}

function createCard(source: AthleteSource, id: string, acquiredAt: string, bound: boolean): ManagerCard {
  assert(source.traits.length > 0 && POSITIONS.every((position) => Number.isFinite(source.positions[position]) && source.positions[position] >= 40 && source.positions[position] <= 99), "A origem desta carta é inválida.");
  return { id, source: structuredClone(source), acquiredAt, bound, inherited: zeroRatings(), training: zeroRatings(), fusion: zeroRatings(),
    attributes: { finishing: source.positions.ATA, passing: source.positions.ALA_MEI, defense: source.positions.DEF,
      speed: round((source.positions.ATA + source.positions.ALA_MEI) / 2), physical: round((source.positions.DEF + source.positions.ALA_MEI) / 2) },
    attributesReviewed: false };
}

function sample<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items], result: T[] = [];
  while (pool.length && result.length < count) {
    const value = random();
    assert(Number.isFinite(value) && value >= 0 && value < 1, "Sorteio indisponível.");
    result.push(pool.splice(Math.floor(value * pool.length), 1)[0]!);
  }
  return result;
}

function fusionPreview(state: ManagerState, command: Extract<ManagerCommand, { type: "fuse" }>) {
  assert(POSITIONS.includes(command.position), "Escolha uma posição válida.");
  assert(command.mode === "inherit" || command.mode === "four", "Escolha um tipo de evolução válido.");
  assert(Array.isArray(command.donorIds), "Selecione as cartas que serão consumidas.");
  const target = state.cards.find((card) => card.id === command.targetId);
  assert(target, "A carta principal não pertence ao seu clube.");
  const expected = command.mode === "inherit" ? 1 : 4;
  assert(command.donorIds.length === expected && new Set(command.donorIds).size === expected, `Selecione ${expected} cópia(s) diferente(s).`);
  assert(!command.donorIds.includes(target.id), "A carta principal não pode ser consumida.");
  const donors = command.donorIds.map((id) => state.cards.find((card) => card.id === id));
  assert(donors.every((card) => card && card.source.playerId === target.source.playerId), "Use apenas cópias do mesmo atleta que pertençam ao seu clube.");
  const positions = cardPositions(target), upgraded = structuredClone(target);
  if (command.mode === "inherit") {
    const value = donors[0]!.source.positions[command.position];
    assert(value > positions[command.position], "A nota ORIGINAL da doadora precisa superar a nota atual nesta posição.");
    upgraded.inherited[command.position] = round(upgraded.inherited[command.position] + value - positions[command.position]);
  } else {
    assert(Object.values(target.fusion).reduce((sum, value) => sum + value, 0) + 2 <= 8, "Esta carta já atingiu o limite total de +8 por fusões.");
    assert(donors.every((card) => POSITIONS.every((position) => card!.source.positions[position] <= positions[position])), "Uma doadora tem posição original superior. Use a herança ou escolha outra cópia.");
    assert(positions[command.position] + 2 <= 99, "Esta posição não comporta +2 sem ultrapassar 99.");
    upgraded.fusion[command.position] += 2;
  }
  upgraded.bound = target.bound || donors.some((card) => card!.bound);
  cardOverall(upgraded);
  return upgraded;
}

export function executeCommand(state: ManagerState, command: ManagerCommand, context: { catalog: AthleteSource[]; now: string; newId: () => string; random: () => number }): ManagerState {
  assert(state.schemaVersion === 1, "Esta versão do jogo precisa ser atualizada.");
  assert(command && typeof command === "object", "Ação inválida.");
  const next = structuredClone(state);
  if (command.type === "fuse") {
    const upgraded = fusionPreview(state, command);
    next.cards = next.cards.filter((card) => !command.donorIds.includes(card.id)).map((card) => card.id === command.targetId ? upgraded : card);
    return next;
  }
  assert(command.type === "open-pack" || command.type === "claim-pack", "Ação inválida.");
  const pack = next.packs.find((item) => item.id === command.packId);
  assert(pack, "Este pacote não pertence ao seu clube.");
  if (command.type === "open-pack") {
    if (pack.status !== "sealed") return next;
    assert(!next.packs.some((item) => item.id !== pack.id && item.status === "offered"), "Conclua a escolha do pacote aberto antes de abrir outro.");
    let pool = [...new Map(context.catalog.map((source) => [source.playerId, source])).values()];
    if (pack.kind !== "standard") { const discovered = new Set(next.discovered.map((source) => source.playerId)); pool = pool.filter((source) => !discovered.has(source.playerId)); }
    if (pack.preferredPosition) { const position = pack.preferredPosition, traits = { DEF: "defensive", ALA_MEI: "midfield", ATA: "offensive", GOL: null } as const;
      pool = pool.filter((source) => position === "GOL" ? source.goalkeeperEligible : source.traits.includes(traits[position]!)); }
    const count = pack.kind === "choice" ? 3 : 1;
    assert(pool.length >= count, "Ainda não há atletas elegíveis suficientes. Seu pacote foi preservado.");
    pack.offers = structuredClone(sample(pool, count, context.random)); pack.status = "offered"; return next;
  }
  if (pack.status === "claimed") return next;
  assert(pack.status === "offered", "Abra o pacote primeiro.");
  const source = pack.offers.find((offer) => offer.playerId === command.playerId);
  assert(source, "Escolha uma das cartas oferecidas neste pacote.");
  if (pack.kind !== "standard") assert(!next.discovered.some((item) => item.playerId === source.playerId), "Este atleta já foi descoberto. Escolha outro pacote antes de continuar.");
  const card = createCard(source, context.newId(), context.now, pack.bound);
  next.cards.push(card); if (!next.discovered.some((item) => item.playerId === source.playerId)) next.discovered.push(structuredClone(source));
  pack.status = "claimed"; pack.claimedCardId = card.id; return next;
}
