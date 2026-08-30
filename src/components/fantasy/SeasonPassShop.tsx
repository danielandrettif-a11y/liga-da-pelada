"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, Sparkles } from "@/components/icons";
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

  return <section className="overflow-hidden rounded-3xl border border-[#d7adff]/35 bg-[radial-gradient(circle_at_10%_0%,rgba(164,77,255,.22),transparent_38%),#100b1b]">
    <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d7adff]/40 bg-[#a04dff]/15 text-[#e4c3ff]"><Sparkles className="h-5 w-5" /></span>
        <div>
          <p className="font-athletic text-[10px] font-black uppercase italic tracking-[.16em] text-[#d7adff]">Trilha extra</p>
          <h2 className="mt-0.5 text-base font-black text-white">Loja do Passe</h2>
          <p className="mt-1 text-[11px] leading-4 text-muted">{status}</p>
        </div>
      </div>
      <div className="shrink-0 rounded-2xl border border-[#d7adff]/35 bg-black/25 px-3 py-2 text-right">
        <span className="block font-athletic text-lg font-black text-[#e4c3ff]">{shop.balancePoints}</span>
        <span className="block text-[8px] font-black uppercase tracking-wide text-[#d7adff]">pts livres</span>
      </div>
    </header>

    <div className="p-3 sm:p-4">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <ShopMetric label="Ganhos" value={shop.extraPointsEarned} />
        <ShopMetric label="Ciclo 5/5" value={shop.bonusPoints} />
        <ShopMetric label="Usados" value={shop.spentPoints} />
      </div>

      {shop.items.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {shop.items.map((item) => <ShopItem key={item.id} item={item} unlocked={shop.isUnlocked} balance={shop.balancePoints} pending={pending} onBuy={() => buy(item)} />)}
      </div> : <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-5 text-center">
        <p className="text-xs font-black text-white">{shop.hasStarted ? "Coleção extra em dia" : "Sua loja ainda está vazia"}</p>
        <p className="mt-1 text-[11px] leading-4 text-muted">{shop.hasStarted ? "Continue avançando para ganhar saldo quando surgirem novos itens." : "Ao escolher um pacote, a opção não escolhida fica guardada aqui para você comprar mais tarde."}</p>
      </div>}
    </div>
  </section>;
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
