"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles, X } from "@/components/icons";
import { claimPassCosmetic, type CosmeticPassReward } from "@/lib/actions/cosmetics";
import { cosmeticFrameImage, cosmeticImage, cosmeticNameplateClass, cosmeticVisual, COSMETIC_SLOT_LABELS, rarityClass, type CosmeticItem } from "@/lib/fantasy/cosmetics";

export function PassRewardPicker({ reward, progress, onClose }: { reward: CosmeticPassReward | null; progress: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!reward) return null;
  const unlocked = progress >= reward.house;
  const lockedSecret = reward.house === 40 && !unlocked;
  const chosenId = reward.selectedCosmeticId;
  const hasChoice = reward.options.length > 1;
  const choose = (item: CosmeticItem) => startTransition(async () => {
    const result = await claimPassCosmetic(reward.id, item.id);
    if (result.success) { router.refresh(); onClose(); }
    else window.alert(result.error || "Não foi possível resgatar.");
  });
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Escolha da recompensa do Passe" onClick={onClose}>
    <section className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-accent/35 bg-[#07150d] shadow-[0_24px_70px_rgba(0,0,0,.9)]" onClick={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-20 flex items-start justify-between border-b border-white/10 bg-[#07150d]/95 p-4 backdrop-blur"><div><p className="font-athletic text-[10px] font-black uppercase tracking-[.16em] text-accent">Casa {reward.house} · Passe BQ</p><h2 className="mt-1 text-lg font-black text-white">{lockedSecret ? "Recompensa secreta" : reward.rewardType === "card_pack" ? `Pacote ${reward.cardTier === "gold" ? "Ouro" : "Bronze"}` : chosenId ? "Pacote escolhido" : unlocked ? hasChoice ? "Compare e escolha seu pacote" : "Resgate sua recompensa" : "Prêmio bloqueado"}</h2></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button></header>
      {lockedSecret ? <div className="p-7 text-center"><span className="text-4xl">🔒</span><p className="mt-3 font-black text-white">A casa 40 guarda o prêmio final.</p><p className="mt-2 text-xs leading-5 text-muted">Conclua a trilha para revelar as opções lendárias.</p></div> : reward.rewardType === "card_pack" ? <div className="p-7 text-center"><span className="text-4xl">🎴</span><p className="mt-3 font-black text-white">{unlocked ? "Seu pacote já está no Cartola." : "Avance até esta casa para receber o pacote."}</p><p className="mt-2 text-xs leading-5 text-muted">Pacotes são entregues automaticamente e podem ser abertos no Cartola.</p>{unlocked && <button onClick={() => router.push("/cartola")} className="mt-5 rounded-xl bg-accent px-4 py-3 text-xs font-black uppercase text-background">Abrir Cartola</button>}</div> : <div className="p-4"><p className="text-xs leading-5 text-muted">{unlocked ? chosenId ? "Sua escolha é permanente. Os itens recebidos podem ser equipados ou desequipados quando quiser." : hasChoice ? "Toque em uma opção para receber o pacote inteiro. A comparação abaixo mostra exatamente o que entra na sua coleção." : "Esta é uma recompensa exclusiva. Resgate-a para colocar a aura na sua coleção." : "Veja o que cada pacote entrega. Para liberar esta escolha, avance jogando partidas, escalando no Cartola e somando gols e assistências."}</p>
        {reward.bonusCosmetic && <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-300/35 bg-[radial-gradient(circle_at_10%_20%,rgba(251,191,36,.2),transparent_35%),#1b160b] p-3"><FramePreview item={reward.bonusCosmetic} compact /><div><p className="text-[9px] font-black uppercase tracking-wider text-amber-200">Bônus do pacote</p><p className="mt-0.5 text-xs font-black text-white">Moldura {reward.bonusCosmetic.name}</p><p className="mt-1 text-[10px] leading-4 text-amber-100/70">Ela vem junto com qualquer título desta escolha.</p></div></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{reward.options.map((item, index) => <PackageOption key={item.id} item={item} bonus={reward.bonusCosmetic} number={index + 1} selected={chosenId === item.id} locked={!unlocked} disabled={pending || Boolean(chosenId)} onChoose={() => choose(item)} />)}</div>
        <div className="mt-4 flex gap-2 rounded-xl border border-accent/15 bg-accent/5 p-2.5 text-[10px] leading-4 text-muted"><Sparkles className="h-4 w-4 shrink-0 text-accent" />Cosméticos não alteram pontos, Cartoletas, cartas ou ranking.</div>
      </div>}
    </section>
  </div>;
}

function PackageOption({ item, bonus, number, selected, locked, disabled, onChoose }: { item: CosmeticItem; bonus: CosmeticItem | null; number: number; selected: boolean; locked: boolean; disabled: boolean; onChoose: () => void }) {
  const isFrame = item.slot === "frame";
  const isNameplate = item.slot === "nameplate";
  return <article className={`overflow-hidden rounded-3xl border bg-[#0b1b11] ${rarityClass(item.rarity)} ${selected ? "ring-2 ring-accent" : ""}`}><div className={`relative min-h-32 overflow-hidden bg-gradient-to-br ${cosmeticVisual(item.assetKey)}`}><div className="absolute inset-0 opacity-70" style={(cosmeticImage(item.assetKey) || cosmeticFrameImage(item.assetKey)) ? { backgroundImage: `linear-gradient(rgba(3,14,8,.26),rgba(3,14,8,.72)),url(${cosmeticImage(item.assetKey) || cosmeticFrameImage(item.assetKey)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} /><div className="relative flex h-32 items-center justify-center">{isNameplate ? <NameplatePreview item={item} /> : <FramePreview item={isFrame ? item : bonus} />}<span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[8px] font-black uppercase text-white">Pacote {number}</span></div></div><div className="p-3"><p className="text-[8px] font-black uppercase tracking-wider text-muted">{COSMETIC_SLOT_LABELS[item.slot]}{bonus ? " + moldura" : ""}</p><h3 className="mt-1 text-sm font-black text-white">{item.name}</h3><p className="mt-1 min-h-8 text-[10px] leading-4 text-muted">{item.description}</p>{bonus && <p className="mt-2 rounded-lg bg-amber-300/10 px-2 py-1.5 text-[9px] font-bold text-amber-100">+ {bonus.name}</p>}{selected ? <span className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-accent px-2 py-2.5 text-[9px] font-black uppercase text-background"><CheckCircle2 className="h-3.5 w-3.5" /> Escolhido</span> : <button type="button" disabled={locked || disabled} onClick={onChoose} className="mt-3 w-full rounded-xl border border-accent/35 bg-accent/10 px-2 py-2.5 text-[9px] font-black uppercase text-accent transition-colors hover:bg-accent hover:text-background disabled:opacity-40">{locked ? "Bloqueado" : "Escolher pacote"}</button>}</div></article>;
}

function FramePreview({ item, compact = false }: { item: CosmeticItem | null; compact?: boolean }) {
  const image = cosmeticFrameImage(item?.assetKey);
  return <span className={`${compact ? "h-14 w-14" : "h-20 w-20"} relative shrink-0 rounded-full border-2 border-amber-200/70 bg-gradient-to-br from-[#163b23] to-[#020805] shadow-[0_0_18px_rgba(251,191,36,.4)]`}><span className="absolute inset-[17%] rounded-full border border-white/25 bg-black/35" />{image && <span className="absolute inset-0 rounded-full bg-cover bg-center mix-blend-screen" style={{ backgroundImage: `url(${image})` }} />}</span>;
}

function NameplatePreview({ item }: { item: CosmeticItem }) {
  return <span className={`rounded-xl border px-4 py-2 font-athletic text-sm font-black uppercase italic tracking-wide ${cosmeticNameplateClass(item.assetKey)}`}>Jogador BQ</span>;
}
