"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Lock, ShoppingCart, Sparkles } from "@/components/icons";
import { purchaseSeasonPassShopItem, type SeasonPassShop, type SeasonPassShopItem } from "@/lib/actions/cosmetics";
import { COSMETIC_SLOT_LABELS, cosmeticFrameImage, cosmeticImage, cosmeticVisual, rarityClass } from "@/lib/fantasy/cosmetics";

export function SeasonPassShop({ shop }: { shop: SeasonPassShop }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const buy = (item: SeasonPassShopItem) => {
    if (!window.confirm(`Comprar ${item.cosmetic.name} por ${item.pricePoints} pontos da trilha extra?`)) return;
    startTransition(async () => {
      const result = await purchaseSeasonPassShopItem(item.id);
      if (result.success) router.refresh();
      else window.alert(result.error || "Não foi possível concluir a compra.");
    });
  };

  const status = !shop.hasStarted
    ? "A loja é pessoal: ela começa a ser montada quando você escolher seu primeiro pacote do Passe."
    : !shop.isUnlocked
      ? "Conclua a casa 40 para liberar as compras. Depois disso, cada ponto novo entra na trilha extra."
      : shop.items.length === 0
        ? "Você já resgatou todos os itens que ficaram disponíveis para esta temporada."
        : "Use os pontos conquistados depois da casa 40 para completar sua coleção.";
  // A action já devolve apenas ofertas ainda não compradas.
  const availableItems = shop.items;
  const teaser = !shop.hasStarted
    ? "A loja aparece aqui quando você escolher seu primeiro prêmio."
    : !shop.isUnlocked
      ? `Você já tem ${availableItems.length} ${availableItems.length === 1 ? "item reservado" : "itens reservados"}. Libere na casa 40.`
      : availableItems.length
        ? `${availableItems.length} ${availableItems.length === 1 ? "item disponível" : "itens disponíveis"} para completar sua coleção.`
        : "Sua coleção extra está completa.";

  return <details className="group overflow-hidden rounded-3xl border border-[#d7adff]/45 bg-[radial-gradient(circle_at_7%_0%,rgba(164,77,255,.3),transparent_48%),linear-gradient(135deg,#160d25,#100b1b)] shadow-[0_0_24px_rgba(164,77,255,.16)] open:shadow-[0_0_28px_rgba(164,77,255,.28)]">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 outline-none transition-colors hover:bg-white/[.025] sm:p-4 [&::-webkit-details-marker]:hidden">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d7adff]/55 bg-[#a04dff]/20 text-[#efd9ff] shadow-[0_0_18px_rgba(164,77,255,.22)]"><ShoppingCart className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="font-athletic block text-[9px] font-black uppercase italic tracking-[.16em] text-[#e2bcff]">Trilha extra</span>
        <span className="mt-0.5 block text-sm font-black text-white">Loja do Passe</span>
        <span className="mt-0.5 block truncate text-[10px] leading-4 text-[#cbb7d8]">{teaser}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-xl border border-[#d7adff]/45 bg-black/25 px-2 py-1.5 text-center"><span className="block font-athletic text-base font-black leading-none text-[#f0dcff]">{shop.balancePoints}</span><span className="mt-1 block text-[6px] font-black uppercase tracking-wide text-[#d7adff]">pts livres</span></span>
        <ChevronDown className="h-4 w-4 text-[#e4c3ff] transition-transform duration-200 group-open:rotate-180" />
      </span>
    </summary>

    <div className="border-t border-white/10 p-3 sm:p-4">
      <p className="mb-3 text-[11px] leading-4 text-muted">{status}</p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <ShopMetric label="Ganhos" value={shop.extraPointsEarned} />
        <ShopMetric label="Bônus ganhos" value={shop.bonusPoints} />
        <ShopMetric label="Usados" value={shop.spentPoints} />
      </div>

      {shop.items.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {shop.items.map((item) => <ShopItem key={item.id} item={item} unlocked={shop.isUnlocked} balance={shop.balancePoints} pending={pending} onBuy={() => buy(item)} />)}
      </div> : <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-5 text-center">
        <p className="text-xs font-black text-white">{shop.hasStarted ? "Coleção extra em dia" : "Sua loja ainda está vazia"}</p>
        <p className="mt-1 text-[11px] leading-4 text-muted">{shop.hasStarted ? "Continue avançando para ganhar saldo quando surgirem novos itens." : "Ao escolher um pacote, a opção não escolhida fica guardada aqui para você comprar mais tarde."}</p>
      </div>}
    </div>
  </details>;
}

function ShopMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-black/15 px-2 py-2 text-center"><strong className="block font-athletic text-sm text-white">{value}</strong><span className="block text-[7px] font-black uppercase tracking-wide text-muted">{label}</span></div>;
}

function ShopItem({ item, unlocked, balance, pending, onBuy }: { item: SeasonPassShopItem; unlocked: boolean; balance: number; pending: boolean; onBuy: () => void }) {
  const image = cosmeticImage(item.cosmetic.assetKey) || cosmeticFrameImage(item.cosmetic.assetKey);
  const affordable = balance >= item.pricePoints;
  const disabled = !unlocked || !affordable || pending;

  return <article className={`overflow-hidden rounded-2xl border bg-[#0b1b11] ${rarityClass(item.cosmetic.rarity)}`}>
    <div className={`relative h-20 overflow-hidden bg-gradient-to-br ${cosmeticVisual(item.cosmetic.assetKey)}`}>
      {image ? <div className={`absolute inset-0 ${item.cosmetic.slot === "banner" ? "opacity-100" : "opacity-80"}`} style={{ backgroundImage: `${item.cosmetic.slot === "banner" ? "linear-gradient(rgba(3,14,8,.01),rgba(3,14,8,.2))" : "linear-gradient(rgba(3,14,8,.22),rgba(3,14,8,.74))"},url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }} /> : null}
      <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[7px] font-black uppercase text-white">Casa {item.sourceHouse || "Passe"}</span>
      <span className="absolute right-2 top-2 rounded-full bg-[#a04dff]/85 px-2 py-1 text-[8px] font-black text-white">{item.pricePoints} pts</span>
    </div>
    <div className="p-2.5">
      <p className="text-[8px] font-black uppercase tracking-wide text-muted">{COSMETIC_SLOT_LABELS[item.cosmetic.slot]} · {item.cosmetic.rarity}</p>
      <h3 className="mt-1 min-h-8 text-[11px] font-black leading-4 text-white">{item.cosmetic.name}</h3>
      <button type="button" disabled={disabled} onClick={onBuy} className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-[#d7adff]/35 bg-[#a04dff]/15 px-2 py-2 text-[8px] font-black uppercase text-[#e9d2ff] transition-colors hover:bg-[#a04dff] hover:text-white disabled:cursor-not-allowed disabled:opacity-45">
        {!unlocked ? <><Lock className="h-3 w-3" /> Casa 40</> : affordable ? <><Sparkles className="h-3 w-3" /> {pending ? "Comprando" : "Comprar"}</> : <><CheckCircle2 className="h-3 w-3" /> Faltam {item.pricePoints - balance}</>}
      </button>
    </div>
  </article>;
}
