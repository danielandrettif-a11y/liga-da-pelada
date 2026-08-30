"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles, X } from "@/components/icons";
import { claimPassCosmetic, type CosmeticPassReward } from "@/lib/actions/cosmetics";
import { cosmeticImage, cosmeticNameplateClass, cosmeticVisual, COSMETIC_SLOT_LABELS, rarityClass, type CosmeticItem } from "@/lib/fantasy/cosmetics";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { CosmeticTitlePreview } from "@/components/fantasy/CosmeticTitlePreview";

export function PassRewardPicker({ reward, progress, playerName, playerAvatarUrl, onClose }: { reward: CosmeticPassReward | null; progress: number; playerName?: string | null; playerAvatarUrl?: string | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // O componente permanece montado mesmo sem prêmio aberto. O bloqueio antigo
  // rodava no mount e podia deixar o body sem scroll durante toda a aba Passe.
  useDialogViewport(Boolean(reward));
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
  return <div className="mobile-dialog-backdrop z-[100] bg-black/75 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Escolha da recompensa do Passe" onClick={onClose}>
    <section className="mobile-dialog-panel flex max-w-lg flex-col rounded-3xl border border-accent/35 bg-[#07150d] shadow-[0_24px_70px_rgba(0,0,0,.9)]" onClick={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-20 flex items-start justify-between border-b border-white/10 bg-[#07150d]/95 p-4 backdrop-blur"><div><p className="font-athletic text-[10px] font-black uppercase tracking-[.16em] text-accent">Casa {reward.house} · Passe BQ</p><h2 className="mt-1 text-lg font-black text-white">{lockedSecret ? "Recompensa secreta" : reward.rewardType === "card_pack" ? `Pacote ${reward.cardTier === "gold" ? "Ouro" : "Bronze"}` : chosenId ? "Pacote escolhido" : unlocked ? hasChoice ? "Compare e escolha seu pacote" : "Resgate sua recompensa" : "Prêmio bloqueado"}</h2></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button></header>
      <div className="mobile-dialog-scroll flex-1">{lockedSecret ? <div className="p-7 text-center"><span className="text-4xl">🔒</span><p className="mt-3 font-black text-white">A casa 40 guarda o prêmio final.</p><p className="mt-2 text-xs leading-5 text-muted">Conclua a trilha para revelar as opções lendárias.</p></div> : reward.rewardType === "card_pack" ? <div className="p-7 text-center"><span className="text-4xl">🎴</span><p className="mt-3 font-black text-white">{unlocked ? "Seu pacote já está no Cartola." : "Avance até esta casa para receber o pacote."}</p><p className="mt-2 text-xs leading-5 text-muted">Pacotes são entregues automaticamente e podem ser abertos no Cartola.</p>{unlocked && <button onClick={() => router.push("/cartola")} className="mt-5 rounded-xl bg-accent px-4 py-3 text-xs font-black uppercase text-background">Abrir Cartola</button>}</div> : <div className="p-4">{chosenId && <div className="mb-3 flex items-center gap-3 rounded-2xl border border-accent/50 bg-accent/15 p-3 text-accent"><CheckCircle2 className="h-6 w-6 shrink-0" /><div><p className="text-[10px] font-black uppercase tracking-wider">Escolha já realizada</p><p className="mt-0.5 text-xs font-bold text-white">Você escolheu: {reward.options.find((item) => item.id === chosenId)?.name || "opção do pacote"}</p><p className="mt-0.5 text-[10px] text-accent/80">Essa decisão é permanente.</p></div></div>}<p className="text-xs leading-5 text-muted">{unlocked ? chosenId ? "Sua escolha é permanente. Os itens recebidos podem ser equipados ou desequipados quando quiser." : hasChoice ? "Toque em uma opção para receber o pacote inteiro. A comparação abaixo mostra exatamente o que entra na sua coleção." : "Esta é uma recompensa exclusiva. Resgate-a para colocar a aura na sua coleção." : "Veja o que cada pacote entrega. Para liberar esta escolha, avance jogando partidas, escalando no Cartola e somando gols e assistências."}</p>
        {reward.bonusCosmetic && <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-300/35 bg-[radial-gradient(circle_at_10%_20%,rgba(251,191,36,.2),transparent_35%),#1b160b] p-3"><FramePreview item={reward.bonusCosmetic} playerName={playerName} playerAvatarUrl={playerAvatarUrl} compact /><div><p className="text-[9px] font-black uppercase tracking-wider text-amber-200">Bônus do pacote</p><p className="mt-0.5 text-xs font-black text-white">Moldura {reward.bonusCosmetic.name}</p><p className="mt-1 text-[10px] leading-4 text-amber-100/70">Ela vem junto com qualquer título desta escolha.</p></div></div>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">{reward.options.map((item, index) => <PackageOption key={item.id} item={item} bonus={reward.bonusCosmetic} playerName={playerName} playerAvatarUrl={playerAvatarUrl} number={index + 1} selected={chosenId === item.id} hasChosen={Boolean(chosenId)} locked={!unlocked} disabled={pending || Boolean(chosenId)} onChoose={() => choose(item)} />)}</div>
        <div className="mt-4 flex gap-2 rounded-xl border border-accent/15 bg-accent/5 p-2.5 text-[10px] leading-4 text-muted"><Sparkles className="h-4 w-4 shrink-0 text-accent" />Cosméticos não alteram pontos, Cartoletas, cartas ou ranking.</div>
      </div>}</div>
    </section>
  </div>;
}

function PackageOption({ item, bonus, playerName, playerAvatarUrl, number, selected, hasChosen, locked, disabled, onChoose }: { item: CosmeticItem; bonus: CosmeticItem | null; playerName?: string | null; playerAvatarUrl?: string | null; number: number; selected: boolean; hasChosen: boolean; locked: boolean; disabled: boolean; onChoose: () => void }) {
  const isNameplate = item.slot === "nameplate";
  const isTitle = item.slot === "title";
  return <article className={`overflow-hidden rounded-3xl border bg-[#0b1b11] ${rarityClass(item.rarity)} ${selected ? "ring-2 ring-accent shadow-[0_0_22px_rgba(204,255,0,.28)]" : hasChosen ? "opacity-60" : ""}`}><div className={`relative h-28 min-h-28 overflow-hidden bg-gradient-to-br sm:h-36 sm:min-h-36 ${cosmeticVisual(item.assetKey)}`}><div className={`absolute inset-0 ${item.slot === "banner" ? "opacity-100" : "opacity-55"}`} style={cosmeticImage(item.assetKey) ? { backgroundImage: `${item.slot === "banner" ? "linear-gradient(rgba(3,14,8,.01),rgba(3,14,8,.18))" : "linear-gradient(rgba(3,14,8,.26),rgba(3,14,8,.72))"},url(${cosmeticImage(item.assetKey)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} /><div className="relative flex h-28 items-center justify-center sm:h-36">{isNameplate ? <NameplatePreview item={item} /> : isTitle ? <CosmeticTitlePreview item={item} className="absolute inset-0" /> : <FramePreview item={item} bonusFrame={bonus} playerName={playerName} playerAvatarUrl={playerAvatarUrl} />}<span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-1 text-[7px] font-black uppercase text-white sm:left-3 sm:top-3 sm:px-2 sm:text-[8px]">Pacote {number}</span>{selected && <span className="absolute right-2 top-2 rounded-full bg-accent px-1.5 py-1 text-[7px] font-black uppercase text-background sm:right-3 sm:top-3 sm:px-2 sm:text-[8px]">Sua escolha</span>}</div></div><div className="p-2 sm:p-3"><p className="text-[7px] font-black uppercase tracking-wider text-muted sm:text-[8px]">{COSMETIC_SLOT_LABELS[item.slot]}{bonus ? " + moldura" : ""}</p><h3 className="mt-1 text-[11px] font-black leading-tight text-white sm:text-sm">{item.name}</h3><p className="mt-1 min-h-8 text-[9px] leading-3.5 text-muted sm:text-[10px] sm:leading-4">{item.description}</p>{bonus && <p className="mt-2 rounded-lg bg-amber-300/10 px-2 py-1.5 text-[8px] font-bold text-amber-100 sm:text-[9px]">+ {bonus.name}</p>}{selected ? <span className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-accent px-1 py-2 text-[8px] font-black uppercase text-background sm:mt-3 sm:px-2 sm:py-2.5 sm:text-[9px]"><CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Escolhido por você</span> : hasChosen ? <span className="mt-2 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-1 py-2 text-[8px] font-black uppercase text-muted sm:mt-3 sm:px-2 sm:py-2.5 sm:text-[9px]">Não escolhido</span> : <button type="button" disabled={locked || disabled} onClick={onChoose} className="mt-2 w-full rounded-xl border border-accent/35 bg-accent/10 px-1 py-2 text-[8px] font-black uppercase text-accent transition-colors hover:bg-accent hover:text-background disabled:opacity-40 sm:mt-3 sm:px-2 sm:py-2.5 sm:text-[9px]">{locked ? "Bloqueado" : "Escolher pacote"}</button>}</div></article>;
}

function FramePreview({ item, bonusFrame, playerName, playerAvatarUrl, compact = false }: { item: CosmeticItem | null; bonusFrame?: CosmeticItem | null; playerName?: string | null; playerAvatarUrl?: string | null; compact?: boolean }) {
  const frame = item?.slot === "frame" ? item : bonusFrame?.slot === "frame" ? bonusFrame : null;
  const aura = item?.slot === "aura" ? item : null;
  return <PlayerAvatar name={playerName || "Jogador BQ"} avatarUrl={playerAvatarUrl} clickable={false} frameKey={frame?.assetKey} auraKey={aura?.assetKey} className={`${compact ? "h-14 w-14" : "h-20 w-20 sm:h-24 sm:w-24"} rounded-full border border-amber-200/40 bg-gradient-to-br from-[#163b23] to-[#020805] text-[9px] font-black text-white shadow-[0_0_18px_rgba(251,191,36,.4)]`} />;
}

function NameplatePreview({ item }: { item: CosmeticItem }) {
  return <span className={`rounded-xl border px-4 py-2 font-athletic text-sm font-black uppercase italic tracking-wide ${cosmeticNameplateClass(item.assetKey)}`}>Jogador BQ</span>;
}
