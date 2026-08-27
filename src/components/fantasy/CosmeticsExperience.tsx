"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Crown, Sparkles } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  claimPassCosmetic,
  cleanupMyLegacyCosmeticsPreview,
  dismissMyUnopenedBronzePassPack,
  equipCosmetic,
  resetMyTestPassRewardClaims,
  type CosmeticsDashboard,
} from "@/lib/actions/cosmetics";
import {
  COSMETIC_SLOT_LABELS,
  cosmeticBackgroundPosition,
  cosmeticImage,
  cosmeticNameplateClass,
  cosmeticVisual,
  rarityClass,
  type CosmeticItem,
  type CosmeticSlot,
} from "@/lib/fantasy/cosmetics";

const SLOTS: Array<CosmeticSlot | "all"> = ["all", "banner", "frame", "title", "aura", "nameplate", "background"];

export function PassCosmeticRewards({ cosmetics, progress }: { cosmetics: CosmeticsDashboard; progress: number }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [claimedRewardIds, setClaimedRewardIds] = useState<Set<string>>(() => new Set());
  if (!cosmetics.available) return null;
  const pending = cosmetics.rewards.filter(
    (reward) => reward.rewardType === "cosmetic_choice" && reward.house <= progress && !reward.selectedCosmeticId && !claimedRewardIds.has(reward.id),
  );
  if (!pending.length) {
    return <section className="rounded-3xl border border-[#a65cff]/25 bg-[#160d25]/70 p-4"><div className="flex items-center gap-2 text-[#e0b9ff]"><CheckCircle2 className="h-4 w-4" /><p className="text-xs font-black">Recompensas cosméticas em dia</p></div><p className="mt-1 text-[11px] text-white/60">Continue avançando para liberar novos visuais Várzea Premium.</p></section>;
  }
  return (
    <section className="overflow-hidden rounded-3xl border border-[#d7adff]/30 bg-[#130c20] p-4">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#a04dff]/20 text-[#e8ccff]"><Sparkles className="h-5 w-5" /></span><div><p className="font-athletic text-xs font-black uppercase italic tracking-[.16em] text-[#e0b9ff]">Escolha sua recompensa</p><p className="mt-1 text-[11px] text-white/65">Cada escolha é exclusiva e fica na sua coleção para sempre.</p></div></div>
      {pending.map((reward) => <div key={reward.id} className="mt-4"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-white/60">Casa {reward.house} · escolha 1 de 2</p><div className="grid grid-cols-2 gap-2">{reward.options.map((item) => <CosmeticOption key={item.id} item={item} disabled={busy} onChoose={() => startTransition(async () => {
        const result = await claimPassCosmetic(reward.id, item.id);
        if (result.success) {
          setClaimedRewardIds((current) => new Set(current).add(reward.id));
          setMessage(`${item.name} entrou na sua coleção!`);
          router.refresh();
        } else setMessage(result.error || "Não foi possível resgatar.");
      })} />)}</div></div>)}
      {message && <p className="mt-3 text-xs font-bold text-accent">{message}</p>}
    </section>
  );
}

export function CosmeticsCollection({ cosmetics, playerName = "Jogador", avatarUrl }: { cosmetics: CosmeticsDashboard; playerName?: string; avatarUrl?: string | null }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [selectedSlot, setSelectedSlot] = useState<CosmeticSlot | "all">("all");
  const [message, setMessage] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [profilePreview, setProfilePreview] = useState(false);
  const [previewLoadout, setPreviewLoadout] = useState<Partial<Record<CosmeticSlot, string | null>>>(() => ({ ...cosmetics.equipped }));

  if (!cosmetics.available) return <section className="glass-card p-5 text-center"><p className="font-black text-foreground">Coleção em preparação</p><p className="mt-1 text-xs text-muted">Aplique as migrations de cosméticos para ativar o Passe.</p></section>;

  const sourceItems = previewMode ? cosmetics.previewCatalog : cosmetics.cosmetics;
  const activeLoadout = previewMode ? previewLoadout : cosmetics.equipped;
  const activeItems = sourceItems.filter((item) => activeLoadout[item.slot] === item.id);
  const bySlot = new Map(activeItems.map((item) => [item.slot, item]));
  const banner = bySlot.get("banner");
  const background = bySlot.get("background");
  const frame = bySlot.get("frame");
  const aura = bySlot.get("aura");
  const title = bySlot.get("title");
  const nameplate = bySlot.get("nameplate");
  const heroAsset = banner?.assetKey || background?.assetKey;
  const heroImage = cosmeticImage(heroAsset);
  const visible = sourceItems.filter((item) => selectedSlot === "all" || item.slot === selectedSlot);

  function togglePreview() {
    if (!previewMode) setPreviewLoadout({ ...cosmetics.equipped });
    setPreviewMode((current) => !current);
    setMessage("");
  }

  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-[#123421] via-[#06150d] to-[#0d1811]">
        <div className="relative p-5">
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_20%_10%,#ccff00_0,transparent_28%),linear-gradient(120deg,transparent_0_45%,rgba(255,255,255,.08)_46%_47%,transparent_48%)]" />
          <div className="relative flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-background shadow-[0_0_24px_rgba(204,255,0,.35)]"><Crown className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-athletic text-xs font-black uppercase italic tracking-[.16em] text-accent">Minha coleção</p><h2 className="mt-1 text-lg font-black text-foreground">Personalizar perfil</h2><p className="mt-1 text-xs leading-5 text-muted">Equipe itens conquistados ou experimente combinações sem alterar seu perfil público.</p></div></div>
          <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
            {cosmetics.canPreviewAll && <button type="button" onClick={togglePreview} className={`w-full rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase transition-colors ${previewMode ? "border-amber-300/50 bg-amber-300/15 text-amber-200" : "border-accent/40 bg-accent/10 text-accent"}`}>{previewMode ? "Sair do provador sem salvar" : "Abrir provador com todos os itens"}</button>}
            <button type="button" onClick={() => setProfilePreview((current) => !current)} className={`w-full rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase transition-colors ${profilePreview ? "border-accent/60 bg-accent text-background" : "border-white/20 bg-black/20 text-white"}`}>{profilePreview ? "Voltar à prévia rápida" : "Ver perfil completo"}</button>
          </div>
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-3xl border ${previewMode ? "border-amber-300/55" : "border-white/10"} bg-gradient-to-br ${cosmeticVisual(heroAsset)} shadow-2xl`} style={heroImage ? { backgroundImage: `linear-gradient(115deg, rgba(2,14,8,.82), rgba(2,14,8,.22)), url(${heroImage})`, backgroundSize: "cover", backgroundPosition: cosmeticBackgroundPosition(banner ? "banner" : "background", heroAsset) } : undefined}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(0,0,0,.55))]" />
        <div className="relative flex min-h-48 flex-col items-center justify-center p-6 text-center">
          <span className={`mb-4 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[.18em] ${previewMode ? "border-amber-300/40 bg-black/55 text-amber-200" : "border-accent/30 bg-black/45 text-accent"}`}>{previewMode ? "Provador temporário" : "Visual equipado"}</span>
          <PlayerAvatar name={playerName} avatarUrl={avatarUrl} clickable={false} frameKey={frame?.assetKey} auraKey={aura?.assetKey} className="h-20 w-20 rounded-full bg-black/55 text-lg font-black text-white" />
          <div className={`mt-4 rounded-xl border px-4 py-2 backdrop-blur-sm ${cosmeticNameplateClass(nameplate?.assetKey)}`}><p className="font-athletic text-lg font-black uppercase italic tracking-wide">{playerName}</p>{title && <p className="mt-0.5 text-[9px] font-black uppercase tracking-[.16em]">✦ {title.name}</p>}</div>
        </div>
        {profilePreview && <div className="relative border-t border-white/10 bg-[#031109]/75 p-4 backdrop-blur-sm"><p className="text-center text-[9px] font-black uppercase tracking-[.18em] text-accent">Prévia do perfil completo</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["PONTOS", "29"], ["JOGOS", "9"], ["GOLS", "3"], ["ASSISTS", "4"]].map(([label, value]) => <div key={label} className="rounded-xl border border-accent/15 bg-black/20 p-2 text-center"><p className="text-[8px] font-black text-muted">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div>)}</div><div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-muted">Identidade do jogador</p><p className="mt-1 text-xs font-black text-white">{playerName}</p><p className="mt-0.5 text-[10px] text-accent">{title ? `✦ ${title.name}` : "Sem título equipado"}</p><p className="mt-2 text-[10px] leading-4 text-muted">Esta visualização mostra como sua foto, moldura, aura, título e nameplate aparecem no perfil público.</p></div></div>}
      </div>

      {previewMode && <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-center text-[10px] font-bold text-amber-100">Nada neste provador é salvo no inventário ou exibido para outros usuários.</p>}

      <div className="flex gap-2 overflow-x-auto pb-1">{SLOTS.map((slot) => <button key={slot} onClick={() => setSelectedSlot(slot)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black uppercase ${selectedSlot === slot ? "bg-accent text-background" : "border border-border bg-surface text-muted"}`}>{slot === "all" ? "Todos" : COSMETIC_SLOT_LABELS[slot]}</button>)}</div>

      {visible.length ? <div className="grid gap-3 sm:grid-cols-2">{visible.map((item) => {
        const selected = activeLoadout[item.slot] === item.id;
        const owned = cosmetics.cosmetics.some((ownedItem) => ownedItem.id === item.id);
        const image = cosmeticImage(item.assetKey);
        return <article key={item.id} className={`relative overflow-hidden rounded-2xl border bg-surface p-4 ${rarityClass(item.rarity)} ${selected ? "ring-1 ring-accent/70" : ""}`}><div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-r opacity-90 ${cosmeticVisual(item.assetKey)}`} style={image ? { backgroundImage: `linear-gradient(rgba(3,14,8,.05), rgba(3,14,8,.38)), url(${image})`, backgroundSize: "cover", backgroundPosition: cosmeticBackgroundPosition(item.slot, item.assetKey) } : undefined}><div className="cosmetic-card-shimmer absolute inset-0" /></div><div className="relative"><div className="flex items-start justify-between gap-2"><span className="rounded-md bg-black/55 px-2 py-1 text-[8px] font-black uppercase backdrop-blur-sm">{COSMETIC_SLOT_LABELS[item.slot]} · {item.rarity}</span>{selected && <span className="rounded-md bg-accent px-2 py-1 text-[8px] font-black text-background">{previewMode ? "Na prévia" : "Equipado"}</span>}</div><h3 className="mt-16 text-sm font-black text-foreground">{item.name}</h3><p className="mt-1 min-h-8 text-[11px] leading-4 text-muted">{item.description}</p>{previewMode ? <button disabled={selected} onClick={() => setPreviewLoadout((current) => ({ ...current, [item.slot]: item.id }))} className="mt-3 w-full rounded-xl border border-amber-300/40 bg-amber-300/10 py-2.5 text-[10px] font-black uppercase text-amber-100 disabled:opacity-50">{selected ? "Aplicado no provador" : "Testar no perfil"}</button> : <button disabled={busy || !owned} onClick={() => startTransition(async () => { const result = await equipCosmetic(item.slot, selected ? null : item.id); if (result.success) router.refresh(); setMessage(result.success ? (selected ? `${item.name} desequipado.` : `${item.name} equipado.`) : result.error || "Não foi possível equipar."); })} className={`mt-3 w-full rounded-xl py-2.5 text-[10px] font-black uppercase disabled:opacity-50 ${selected ? "border border-border text-muted" : "bg-accent text-background"}`}>{selected ? "Desequipar" : "Equipar"}</button>}</div></article>;
      })}</div> : <div className="glass-card p-6 text-center text-xs text-muted">Você ainda não possui itens nesta categoria.</div>}

      {cosmetics.canPreviewAll && !previewMode && <details className="rounded-2xl border border-border bg-surface/70 p-3"><summary className="cursor-pointer text-[10px] font-black uppercase text-muted">Limpeza do antigo modo de teste</summary><div className="mt-2 text-[10px] leading-4 text-muted">Use a primeira opção se os resgates antigos foram só testes: ela reabre as escolhas cosméticas da trilha atual, sem reativar o pacote Bronze.</div><div className="mt-3 grid gap-2 sm:grid-cols-3"><button disabled={busy} onClick={() => { if (!window.confirm("Remover as escolhas cosméticas de teste desta trilha para resgatar os prêmios reais novamente? Itens do Passe atual serão removidos da sua coleção até você escolhê-los de verdade.")) return; startTransition(async () => { const result = await resetMyTestPassRewardClaims(cosmetics.seasonId || ""); if (result.success) router.refresh(); setMessage(result.success ? `${result.removed} registros de teste removidos. As escolhas do Passe foram reabertas.` : result.error || "Falha ao reabrir os resgates."); }); }} className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[9px] font-black uppercase text-accent disabled:opacity-50">Reabrir prêmios de teste</button><button disabled={busy} onClick={() => { if (!window.confirm("Remover da sua conta os cosméticos concedidos pelo antigo teste?")) return; startTransition(async () => { const result = await cleanupMyLegacyCosmeticsPreview(); if (result.success) router.refresh(); setMessage(result.success ? `${result.removed} concessões antigas removidas.` : result.error || "Falha na limpeza."); }); }} className="rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-[9px] font-black uppercase text-danger disabled:opacity-50">Limpar cosméticos antigos</button><button disabled={busy} onClick={() => { if (!window.confirm("Ocultar apenas o seu pacote Bronze fechado do Passe?")) return; startTransition(async () => { const result = await dismissMyUnopenedBronzePassPack(); if (result.success) router.refresh(); setMessage(result.success ? (result.dismissed ? "Pacote Bronze removido da sua conta." : "Nenhum pacote Bronze fechado encontrado.") : result.error || "Falha ao remover pacote."); }); }} className="rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-[9px] font-black uppercase text-amber-200 disabled:opacity-50">Remover meu pacote Bronze</button></div></details>}
      {message && <p className="text-center text-xs font-bold text-accent">{message}</p>}
    </section>
  );
}

function CosmeticOption({ item, disabled, onChoose }: { item: CosmeticItem; disabled: boolean; onChoose: () => void }) {
  const image = cosmeticImage(item.assetKey);
  return <button disabled={disabled} onClick={onChoose} className={`group overflow-hidden rounded-2xl border bg-surface text-left transition-transform active:scale-[.98] disabled:opacity-50 ${rarityClass(item.rarity)}`}><div className={`relative h-24 bg-gradient-to-br ${cosmeticVisual(item.assetKey)}`} style={image ? { backgroundImage: `linear-gradient(rgba(3,14,8,.1),rgba(3,14,8,.5)),url(${image})`, backgroundSize: "cover", backgroundPosition: cosmeticBackgroundPosition(item.slot, item.assetKey) } : undefined}><div className="cosmetic-card-shimmer absolute inset-0" /></div><span className="block p-3"><span className="text-[8px] font-black uppercase opacity-70">{COSMETIC_SLOT_LABELS[item.slot]}</span><strong className="mt-1 block text-xs text-foreground">{item.name}</strong><span className="mt-2 block text-[9px] font-black uppercase text-accent">Escolher</span></span></button>;
}
