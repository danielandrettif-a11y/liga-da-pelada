"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount, getAdminClient } from "@/lib/auth";
import { FANTASY_CARDS_CATALOG, getCardBySlug, type FantasyCardDefinition } from "@/lib/fantasy/cards/catalog";
import { generatePackOffers } from "@/lib/fantasy/cards/pack-generator";
import { MAX_SPECIAL_CARDS_PER_ROUND, type FantasyCardRarity } from "@/lib/fantasy/cards/config";

export type FantasyPackDTO = {
  id: string;
  roundId: string;
  roundNumber?: number;
  status: "available" | "opened" | "claimed";
  openedAt: string | null;
  chosenCardId: string | null;
  createdAt: string;
  offers: Array<{
    slot: number;
    card: FantasyCardDefinition;
  }>;
};

export type FantasyUserCardDTO = {
  id: string;
  cardId: string;
  slug: string;
  name: string;
  description: string;
  rarity: FantasyCardRarity;
  effectType: string;
  effectConfig: Record<string, any>;
  status: "OWNED" | "RESERVED" | "LOCKED" | "CONSUMED";
  acquiredAt: string;
  consumedAt: string | null;
  icon: string;
};

export type FantasyActiveCardDTO = {
  id: string;
  roundId: string;
  userCardId: string;
  card: FantasyCardDefinition;
  status: "RESERVED" | "LOCKED" | "RESOLVED";
  targetPlayerId?: string | null;
  targetPlayer2Id?: string | null;
  targetPrediction?: "TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE" | null;
  resultBonus?: number;
  resultDetails?: any;
};

/**
 * Busca todos os pacotes do usuário logado (pendentes e concluídos).
 */
export async function getMyPacks(): Promise<{
  availablePacks: FantasyPackDTO[];
  claimedCount: number;
  totalPacks: number;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { availablePacks: [], claimedCount: 0, totalPacks: 0 };

  const { data: packs } = await account.client
    .from("fantasy_round_packs")
    .select(
      "id, round_id, status, opened_at, chosen_card_id, created_at, rounds:round_id(number), offers:fantasy_pack_offers(slot, card:fantasy_cards(*))"
    )
    .eq("user_id", account.user.id)
    .order("created_at", { ascending: false });

  if (!packs) return { availablePacks: [], claimedCount: 0, totalPacks: 0 };

  const formatted: FantasyPackDTO[] = packs.map((p: any) => ({
    id: p.id,
    roundId: p.round_id,
    roundNumber: p.rounds?.number,
    status: p.status,
    openedAt: p.opened_at,
    chosenCardId: p.chosen_card_id,
    createdAt: p.created_at,
    offers: (p.offers || []).map((off: any) => {
      const cardDef = off.card ? getCardBySlug(off.card.slug) : null;
      return {
        slot: off.slot,
        card: cardDef || {
          slug: off.card?.slug || "unknown",
          name: off.card?.name || "Carta",
          description: off.card?.description || "",
          rarity: off.card?.rarity || "COMMON",
          effectType: off.card?.effect_type || "NONE",
          effectConfig: off.card?.effect_config || {},
          enabled: true,
          icon: "🃏",
          requiresTarget: "NONE",
        },
      };
    }),
  }));

  const availablePacks = formatted.filter((p) => p.status !== "claimed");
  const claimedCount = formatted.filter((p) => p.status === "claimed").length;

  return {
    availablePacks,
    claimedCount,
    totalPacks: formatted.length,
  };
}

/**
 * Abre um pacote pela primeira vez ou retorna as ofertas já existentes (Idempotente).
 */
export async function openPack(packId: string): Promise<{
  success: boolean;
  offers?: [FantasyCardDefinition, FantasyCardDefinition];
  error?: string;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = await getAdminClient();
  if (!client) return { success: false, error: "Erro de conexão administrativa." };

  // Buscar pacote
  const { data: pack, error: packErr } = await client
    .from("fantasy_round_packs")
    .select("id, user_id, status, offers:fantasy_pack_offers(slot, card:fantasy_cards(*))")
    .eq("id", packId)
    .single();

  if (packErr || !pack || pack.user_id !== account.user.id) {
    return { success: false, error: "Pacote não encontrado ou não pertence a você." };
  }

  if (pack.status === "claimed") {
    return { success: false, error: "Este pacote já foi resgatado." };
  }

  // Se já tiver ofertas salvas, retorna as mesmas (Idempotência estrita)
  if (pack.offers && pack.offers.length >= 2) {
    const sorted = [...pack.offers].sort((a: any, b: any) => a.slot - b.slot);
    const card1Obj = Array.isArray(sorted[0].card) ? sorted[0].card[0] : sorted[0].card;
    const card2Obj = Array.isArray(sorted[1].card) ? sorted[1].card[0] : sorted[1].card;
    const c1 = getCardBySlug(card1Obj?.slug)!;
    const c2 = getCardBySlug(card2Obj?.slug)!;
    return { success: true, offers: [c1, c2] };
  }

  // Sorteio server-side de 2 opções distintas
  const [offer1, offer2] = generatePackOffers();

  // Buscar IDs no banco
  const { data: dbCards } = await client
    .from("fantasy_cards")
    .select("id, slug")
    .in("slug", [offer1.slug, offer2.slug]);

  const cardMap = new Map((dbCards || []).map((c: any) => [c.slug, c.id]));
  const id1 = cardMap.get(offer1.slug);
  const id2 = cardMap.get(offer2.slug);

  if (!id1 || !id2) {
    return { success: false, error: "Cartas não encontradas no catálogo do banco." };
  }

  // Gravação atômica das 2 ofertas
  const { error: insErr } = await client.from("fantasy_pack_offers").insert([
    { pack_id: packId, slot: 1, card_id: id1 },
    { pack_id: packId, slot: 2, card_id: id2 },
  ]);

  if (insErr) {
    // Se falhou por conflito de concorrência, busca as que foram gravadas
    const { data: existingOffers } = await client
      .from("fantasy_pack_offers")
      .select("slot, card:fantasy_cards(*)")
      .eq("pack_id", packId);
    if (existingOffers && existingOffers.length >= 2) {
      const sorted = [...existingOffers].sort((a: any, b: any) => a.slot - b.slot);
      const ex1 = Array.isArray(sorted[0].card) ? sorted[0].card[0] : sorted[0].card;
      const ex2 = Array.isArray(sorted[1].card) ? sorted[1].card[0] : sorted[1].card;
      return {
        success: true,
        offers: [getCardBySlug(ex1?.slug)!, getCardBySlug(ex2?.slug)!],
      };
    }
    return { success: false, error: `Erro ao gerar ofertas: ${insErr.message}` };
  }

  // Marcar pacote como aberto
  await client
    .from("fantasy_round_packs")
    .update({ status: "opened", opened_at: new Date().toISOString() })
    .eq("id", packId);

  revalidatePath("/cartola");
  return { success: true, offers: [offer1, offer2] };
}

/**
 * Escolhe 1 entre as 2 cartas oferecidas (Definitivo e Atômico).
 */
export async function claimPackCard(
  packId: string,
  chosenSlug: string
): Promise<{ success: boolean; error?: string; chosenCard?: FantasyCardDefinition }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = await getAdminClient();
  if (!client) return { success: false, error: "Erro de conexão administrativa." };

  // Buscar pacote e ofertas
  const { data: pack, error: packErr } = await client
    .from("fantasy_round_packs")
    .select("id, user_id, status, offers:fantasy_pack_offers(slot, card:fantasy_cards(*))")
    .eq("id", packId)
    .single();

  if (packErr || !pack || pack.user_id !== account.user.id) {
    return { success: false, error: "Pacote inválido." };
  }

  if (pack.status === "claimed") {
    return { success: false, error: "Este pacote já foi resgatado." };
  }

  const validOffer = (pack.offers || []).find((off: any) => {
    const cardObj = Array.isArray(off.card) ? off.card[0] : off.card;
    return cardObj?.slug === chosenSlug;
  });
  if (!validOffer) {
    return { success: false, error: "A carta escolhida não pertence às opções sorteadas deste pacote." };
  }

  const validCardObj = Array.isArray(validOffer.card) ? validOffer.card[0] : validOffer.card;
  const cardId = validCardObj?.id;
  const chosenDef = getCardBySlug(chosenSlug);

  // Inserir no inventário pessoal do usuário
  const { error: invErr } = await client.from("fantasy_user_cards").insert({
    user_id: account.user.id,
    card_id: cardId,
    source_pack_id: packId,
    status: "OWNED",
  });

  if (invErr) {
    return { success: false, error: `Erro ao adicionar ao inventário: ${invErr.message}` };
  }

  // Marcar pacote como claimed
  await client
    .from("fantasy_round_packs")
    .update({
      status: "claimed",
      chosen_card_id: cardId,
    })
    .eq("id", packId);

  revalidatePath("/cartola");
  return { success: true, chosenCard: chosenDef };
}

/**
 * Busca o inventário pessoal de cartas do usuário autenticado.
 */
export async function getMyInventory(): Promise<{
  cards: FantasyUserCardDTO[];
  groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  availableCount: number;
}> {
  const account = await getCurrentAccount();
  if (!account.user) return { cards: [], groupedBySlug: {}, availableCount: 0 };

  const { data } = await account.client
    .from("fantasy_user_cards")
    .select("id, card_id, status, acquired_at, consumed_at, card:fantasy_cards(*)")
    .eq("user_id", account.user.id)
    .order("acquired_at", { ascending: false });

  if (!data) return { cards: [], groupedBySlug: {}, availableCount: 0 };

  const cards: FantasyUserCardDTO[] = data.map((item: any) => {
    const cardObj = Array.isArray(item.card) ? item.card[0] : item.card;
    const cardDef = getCardBySlug(cardObj?.slug);
    return {
      id: item.id,
      cardId: item.card_id,
      slug: cardObj?.slug || "unknown",
      name: cardObj?.name || "Carta",
      description: cardObj?.description || "",
      rarity: cardObj?.rarity || "COMMON",
      effectType: cardObj?.effect_type || "NONE",
      effectConfig: cardObj?.effect_config || {},
      status: item.status,
      acquiredAt: item.acquired_at,
      consumedAt: item.consumed_at,
      icon: cardDef?.icon || "🃏",
    };
  });

  const groupedBySlug: Record<
    string,
    { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }
  > = {};

  for (const c of cards) {
    if (!groupedBySlug[c.slug]) {
      const cardDef = getCardBySlug(c.slug) || {
        slug: c.slug,
        name: c.name,
        description: c.description,
        rarity: c.rarity,
        effectType: c.effectType as any,
        effectConfig: c.effectConfig,
        enabled: true,
        icon: c.icon,
        requiresTarget: "NONE",
      };
      groupedBySlug[c.slug] = {
        count: 0,
        card: cardDef,
        instances: [],
      };
    }
    if (c.status === "OWNED") {
      groupedBySlug[c.slug].count += 1;
    }
    groupedBySlug[c.slug].instances.push(c);
  }

  const availableCount = cards.filter((c) => c.status === "OWNED").length;

  return {
    cards,
    groupedBySlug,
    availableCount,
  };
}

/**
 * Busca a carta ativa de uma rodada para o usuário autenticado.
 */
export async function getActiveCardForRound(roundId: string): Promise<FantasyActiveCardDTO | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;

  const { data: activation } = await account.client
    .from("fantasy_card_activations")
    .select("id, round_id, user_card_id, status, target_snapshot, result_bonus, result_details, card:fantasy_cards(*)")
    .eq("round_id", roundId)
    .eq("user_id", account.user.id)
    .maybeSingle();

  if (!activation || !activation.card) return null;

  const cardObj = Array.isArray(activation.card) ? activation.card[0] : activation.card;
  if (!cardObj) return null;

  const cardDef = getCardBySlug(cardObj.slug) || {
    slug: cardObj.slug,
    name: cardObj.name,
    description: cardObj.description,
    rarity: cardObj.rarity,
    effectType: cardObj.effect_type,
    effectConfig: cardObj.effect_config || {},
    enabled: true,
    icon: "🃏",
    requiresTarget: "NONE",
  };

  const targetSnap = (activation.target_snapshot || {}) as any;

  return {
    id: activation.id,
    roundId: activation.round_id,
    userCardId: activation.user_card_id,
    card: cardDef,
    status: activation.status,
    targetPlayerId: targetSnap.targetPlayerId || null,
    targetPlayer2Id: targetSnap.targetPlayer2Id || null,
    targetPrediction: targetSnap.targetPrediction || null,
    resultBonus: Number(activation.result_bonus || 0),
    resultDetails: activation.result_details,
  };
}

/**
 * Ativa uma carta para a rodada atual com validações de alvos e mercado aberto.
 */
export async function activateCardForRound({
  roundId,
  userCardId,
  targetPlayerId,
  targetPlayer2Id,
  targetPrediction,
}: {
  roundId: string;
  userCardId: string;
  targetPlayerId?: string | null;
  targetPlayer2Id?: string | null;
  targetPrediction?: "TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE" | null;
}): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = await getAdminClient();
  if (!client) return { success: false, error: "Erro administrativo." };

  // 1. Verificar status da rodada e mercado
  const { data: round } = await client
    .from("rounds")
    .select("status, round_players(count), matches(id, status, started_at)")
    .eq("id", roundId)
    .single();

  const isLive = (round?.matches || []).some((m: any) => m.started_at || m.status === "in_progress");
  const isMarketOpen = round?.status === "draft" && !isLive;

  if (!isMarketOpen) {
    return { success: false, error: "O mercado já está fechado para esta rodada." };
  }

  // 2. Verificar posse e status da carta do usuário
  const { data: userCard } = await client
    .from("fantasy_user_cards")
    .select("id, user_id, status, card_id, card:fantasy_cards(*)")
    .eq("id", userCardId)
    .single();

  if (!userCard || userCard.user_id !== account.user.id) {
    return { success: false, error: "Carta não encontrada no seu inventário." };
  }

  if (userCard.status !== "OWNED") {
    return { success: false, error: "Esta carta não está disponível para uso." };
  }

  // 3. Se já existia uma ativação anterior para a mesma rodada, liberar a carta anterior para OWNED
  const { data: existingAct } = await client
    .from("fantasy_card_activations")
    .select("id, user_card_id")
    .eq("round_id", roundId)
    .eq("user_id", account.user.id)
    .maybeSingle();

  if (existingAct && existingAct.user_card_id) {
    await client
      .from("fantasy_user_cards")
      .update({ status: "OWNED" })
      .eq("id", existingAct.user_card_id);
  }

  // 4. Salvar snapshot do efeito e dos alvos
  const userCardObj = Array.isArray(userCard.card) ? userCard.card[0] : userCard.card;
  const effectSnapshot = {
    slug: userCardObj?.slug || "",
    name: userCardObj?.name || "",
    rarity: userCardObj?.rarity || "COMMON",
    effectType: userCardObj?.effect_type || "NONE",
    effectConfig: userCardObj?.effect_config || {},
  };

  const targetSnapshot = {
    targetPlayerId: targetPlayerId || null,
    targetPlayer2Id: targetPlayer2Id || null,
    targetPrediction: targetPrediction || null,
  };

  // Upsert da ativação (UNIQUE(round_id, user_id))
  const { error: actErr } = await client.from("fantasy_card_activations").upsert(
    {
      round_id: roundId,
      user_id: account.user.id,
      user_card_id: userCardId,
      card_id: userCard.card_id,
      effect_snapshot: effectSnapshot,
      target_snapshot: targetSnapshot,
      status: "RESERVED",
      reserved_at: new Date().toISOString(),
    },
    { onConflict: "round_id, user_id" }
  );

  if (actErr) {
    return { success: false, error: `Erro ao ativar carta: ${actErr.message}` };
  }

  // Marcar a carta no inventário como RESERVED
  await client
    .from("fantasy_user_cards")
    .update({ status: "RESERVED" })
    .eq("id", userCardId);

  revalidatePath("/cartola");
  return { success: true };
}

/**
 * Remove a carta ativa antes do fechamento do mercado e devolve para OWNED.
 */
export async function removeActiveCardForRound(
  roundId: string
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Não autenticado." };

  const client = await getAdminClient();
  if (!client) return { success: false, error: "Erro administrativo." };

  const { data: act } = await client
    .from("fantasy_card_activations")
    .select("id, user_card_id, status")
    .eq("round_id", roundId)
    .eq("user_id", account.user.id)
    .maybeSingle();

  if (!act) return { success: true };

  if (act.status !== "RESERVED") {
    return { success: false, error: "Não é possível remover a carta após o fechamento do mercado." };
  }

  // Devolver carta para OWNED
  if (act.user_card_id) {
    await client
      .from("fantasy_user_cards")
      .update({ status: "OWNED" })
      .eq("id", act.user_card_id);
  }

  // Deletar ativação
  await client.from("fantasy_card_activations").delete().eq("id", act.id);

  revalidatePath("/cartola");
  return { success: true };
}

/**
 * Gera pacotes para todos os usuários participantes de uma rodada finalizada.
 * Idempotente via UNIQUE(user_id, round_id).
 */
export async function generatePacksForFinishedRound(roundId: string): Promise<number> {
  const client = await getAdminClient();
  if (!client) return 0;

  // Buscar fantasy_round_id correspondente
  const { data: fantasyRound } = await client
    .from("fantasy_rounds")
    .select("id")
    .eq("round_id", roundId)
    .maybeSingle();

  if (!fantasyRound) return 0;

  // Buscar todas as escalações válidas da rodada
  const { data: lineups } = await client
    .from("fantasy_lineups")
    .select("user_id")
    .eq("fantasy_round_id", fantasyRound.id);

  if (!lineups || lineups.length === 0) return 0;

  const userIds = Array.from(new Set(lineups.map((l: any) => l.user_id)));

  const packInserts = userIds.map((userId) => ({
    user_id: userId,
    round_id: roundId,
    status: "available",
  }));

  // Inserir com ignore de duplicatas
  const { data: inserted } = await client
    .from("fantasy_round_packs")
    .upsert(packInserts, { onConflict: "user_id, round_id", ignoreDuplicates: true })
    .select("id");

  return inserted?.length || 0;
}
