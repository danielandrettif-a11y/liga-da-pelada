"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  Loader2,
  LogIn,
  MapPin,
  PencilLine,
  Shield,
  Sparkles,
  Stadium as StadiumIcon,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  X,
} from "@/components/icons";
import {
  addRosterPlayerToCallup,
  adminRemoveCallupPlayer,
  createCallupPrelist,
  inviteGuestToCallup,
  joinActiveCallup,
  leaveActiveCallup,
  removeCallupEntry,
  updateCallup,
  type CallupWithEntries,
} from "@/lib/actions/callups";
import type { Player, PlayerProfile, Stadium } from "@/lib/types";
import type { FantasyQuickHighlight } from "@/lib/actions/fantasy";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";
import { RoundCalendarButton } from "./RoundCalendarButton";
import { CallupTacticalAlertModal } from "./CallupTacticalAlertModal";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  callup: CallupWithEntries;
  currentUserId?: string | null;
  currentPlayerId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  selectablePlayers: Player[];
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
  stadiums?: Stadium[];
  fantasyHighlights?: FantasyQuickHighlight | null;
};

export function CallupBoard({
  callup,
  currentUserId,
  currentPlayerId,
  isAuthenticated,
  isAdmin,
  selectablePlayers,
  stadiumName,
  stadiumMapUrl,
  stadiums = [],
  fantasyHighlights,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [showCartolaPopup, setShowCartolaPopup] = useState(false);
  const [editingCallup, setEditingCallup] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [activeTab, setActiveTab] = useState<"confirmed" | "waitlist">("confirmed");

  // Estado para Contratação de Amigo (Convidado)
  const [isHireGuestOpen, setIsHireGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestProfile, setGuestProfile] = useState<PlayerProfile>("midfield");
  const [isGuestGk, setIsGuestGk] = useState(false);

  useDialogViewport(editingCallup);

  const confirmed = callup.entries.filter((entry) => entry.status === "confirmed");
  const waitlist = callup.entries.filter((entry) => entry.status === "waitlist");
  const capacity = callup.capacity;
  const myEntry = callup.entries.find((entry) => entry.player_id === currentPlayerId);
  const myPosition = myEntry
    ? (myEntry.status === "confirmed"
        ? confirmed.findIndex((e) => e.id === myEntry.id) + 1
        : waitlist.findIndex((e) => e.id === myEntry.id) + 1)
    : null;

  const availableToAdmin = selectablePlayers.filter(
    (player) => !callup.entries.some((entry) => entry.player_id === player.id)
  );

  const startTime = callup.start_time ? callup.start_time.slice(0, 5) : "08:00";
  const formattedFullDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${callup.date}T12:00:00`));

  const progressPercent = Math.min(100, Math.round((confirmed.length / capacity) * 100));
  const remainingSlots = Math.max(0, capacity - confirmed.length);

  async function handleEditCallup(formData: FormData) {
    setEditLoading(true);
    setEditError("");
    const result = await updateCallup(formData);
    if (!result.success) {
      setEditError(result.error || "Erro ao atualizar convocação.");
      setEditLoading(false);
    } else {
      setEditingCallup(false);
      setEditLoading(false);
      router.refresh();
    }
  }

  async function run(key: string, action: () => Promise<{ success: boolean; error?: string }>) {
    setLoading(key);
    setError("");
    const result = await action();
    if (!result.success) {
      setError(result.error || "Não foi possível atualizar a lista.");
    } else {
      if (key === "join") {
        setShowCartolaPopup(true);
      }
      router.refresh();
    }
    setLoading("");
  }

  async function handleInviteGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;
    setLoading("guest");
    setError("");
    const res = await inviteGuestToCallup({
      callupId: callup.id,
      name: guestName.trim(),
      playerProfile: guestProfile,
      isGoalkeeper: isGuestGk,
    });
    if (!res.success) {
      setError(res.error || "Erro ao contratar amigo.");
    } else {
      setGuestName("");
      setIsGuestGk(false);
      router.refresh();
    }
    setLoading("");
  }

  async function copyInvite() {
    const type = callup.round_type === "friendly" ? "Amistoso" : "Pelada Oficial (Ranked)";
    const dateFormatted = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`));
    const venueText = stadiumName ? `\n📍 *Local:* ${stadiumName}` : "";

    const text = `⚽ *CONVOCAÇÃO ABERTA*\n${window.location.origin}/convocacao\n\n🏆 *${type}*\n📅 *Data:* ${dateFormatted}\n⏰ *Horário:* ${startTime}${venueText}\n\n👉 Toque no link acima para confirmar sua presença e ver a lista!`;

    await navigator.clipboard.writeText(text);
    setLoading("copied");
    setTimeout(() => setLoading(""), 1600);
  }

  async function handlePrelist() {
    setLoading("prelist");
    setError("");
    const result = await createCallupPrelist(callup.id);
    if (!result.success || !result.roundId) {
      setError(result.error || "Não foi possível criar a pré-lista.");
      setLoading("");
      return;
    }
    router.push(`/admin/rodada?round=${result.roundId}`);
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip pb-6">
      {/* 1. HERO CARD DA CONVOCAÇÃO */}
      <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/15 via-[#07150d] to-surface p-4 sm:p-5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 font-athletic text-[10px] font-black uppercase tracking-wider text-background">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-background" />
                {callup.status === "locked" ? "Lista Fechada" : "Convocação Aberta"}
              </span>
              <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-0.5 text-[10px] font-bold text-muted uppercase">
                {callup.round_type === "friendly" ? "Amistoso" : "Ranked"}
              </span>
            </div>

            <h1 className="mt-2 text-xl font-black text-foreground capitalize leading-tight">
              {formattedFullDate}
            </h1>
          </div>

          {/* Botões de Ação do Topo */}
          <div className="flex items-center gap-2">
            <RoundCalendarButton
              event={{
                title: `Pelada BQ - ${callup.round_type === "friendly" ? "Amistoso" : "Rodada Oficial"}`,
                date: callup.date,
                startTime: startTime,
                durationMinutes: 120,
                location: stadiumName || undefined,
                mapUrl: stadiumMapUrl || undefined,
                appUrl: "/convocacao",
              }}
              variant="glass"
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEditingCallup(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-muted hover:text-accent hover:border-accent/40 transition-colors"
                title="Editar convocação"
                aria-label="Editar convocação"
              >
                <PencilLine className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={copyInvite}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors shadow-sm"
              title="Copiar convite"
              aria-label="Copiar convite"
            >
              {loading === "copied" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Informações Rápidas de Horário e Local */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-bold text-foreground">
            <Clock className="h-3.5 w-3.5 text-accent" />
            {startTime} (Início)
          </span>

          {stadiumName && (
            stadiumMapUrl ? (
              <a
                href={stadiumMapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 font-bold text-accent hover:bg-accent/20 transition-colors"
                title="Ver no Google Maps"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate max-w-[180px]">{stadiumName}</span>
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-bold text-foreground">
                <StadiumIcon className="h-3.5 w-3.5 text-accent" />
                <span className="truncate max-w-[180px]">{stadiumName}</span>
              </span>
            )
          )}
        </div>

        {/* Barra de Progresso de Vagas */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-muted">Preenchimento das Vagas</span>
            <span className="font-black text-foreground">
              <strong className="text-accent text-sm">{confirmed.length}</strong> / {capacity} Titulares
            </span>
          </div>

          {/* Barra Visual */}
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent/80 to-accent shadow-[0_0_12px_rgba(204,255,0,0.5)] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className={remainingSlots > 0 ? "font-bold text-accent" : "font-bold text-warning"}>
              {remainingSlots > 0
                ? `${remainingSlots} vaga(s) titular(es) restante(s)`
                : "Vagas titulares esgotadas"}
            </span>
            {waitlist.length > 0 && (
              <span className="font-bold text-warning">
                {waitlist.length} na fila de espera
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. CTA DE AÇÃO / STATUS DO JOGADOR LOGADO */}
      <section className="space-y-2">
        {error && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger animate-fade-in">
            {error}
          </div>
        )}

        {callup.status === "locked" ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-center text-xs font-bold text-warning">
            🔒 Lista fechada pelo administrador. Os times estão sendo formados.
          </div>
        ) : !isAuthenticated ? (
          <Link
            href="/login?next=/convocacao"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-sm font-black uppercase tracking-wider text-background shadow-[0_0_25px_rgba(204,255,0,0.25)] transition-transform active:scale-[0.98]"
          >
            <LogIn className="h-5 w-5" /> Entrar para confirmar presença
          </Link>
        ) : myEntry ? (
          /* Card de Status do Jogador Já Confirmado ou na Fila */
          <div
            className={`overflow-hidden rounded-2xl border p-4 shadow-lg ${
              myEntry.status === "confirmed"
                ? "border-accent/40 bg-accent/10"
                : "border-warning/40 bg-warning/10"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-background font-black ${
                    myEntry.status === "confirmed" ? "bg-accent" : "bg-warning"
                  }`}
                >
                  {myEntry.status === "confirmed" ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <Clock className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-foreground">
                    {myEntry.status === "confirmed" ? "Presença Confirmada!" : "Na Fila de Espera"}
                  </p>
                  <p className="text-[11px] text-muted">
                    {myEntry.status === "confirmed"
                      ? `Você é o titular na vaga #${myPosition}`
                      : `Você é o #${myPosition} da fila de espera`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => run("leave", () => leaveActiveCallup(callup.id))}
                disabled={!!loading}
                className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-bold text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
              >
                {loading === "leave" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : myEntry.status === "confirmed" ? (
                  "Desistir da vaga"
                ) : (
                  "Sair da fila"
                )}
              </button>
            </div>

            {myEntry.status === "confirmed" && (
              <div className="mt-3 flex items-center justify-between border-t border-accent/20 pt-2.5 text-xs">
                <span className="text-[11px] text-muted flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-accent" /> Já escalou seu Cartola?
                </span>
                <Link
                  href="/cartola"
                  className="font-black text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  Abrir Cartola <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        ) : currentPlayerId ? (
          /* Botão de Entrar na Lista (Confirmar Presença) */
          <button
            onClick={() => run("join", () => joinActiveCallup(callup.id))}
            disabled={!!loading}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black uppercase tracking-wider text-background shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50 ${
              confirmed.length < capacity
                ? "bg-accent shadow-[0_0_30px_rgba(204,255,0,0.3)] animate-pulse"
                : "bg-warning shadow-[0_0_30px_rgba(234,179,8,0.25)]"
            }`}
          >
            {loading === "join" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Confirmando...
              </>
            ) : confirmed.length < capacity ? (
              <>
                <CheckCircle2 className="h-5 w-5" /> Confirmar Minha Presença ({remainingSlots} vagas)
              </>
            ) : (
              <>
                <Clock className="h-5 w-5" /> Entrar na Fila de Espera (#{waitlist.length + 1})
              </>
            )}
          </button>
        ) : (
          <div className="rounded-2xl border border-warning/25 bg-warning/10 p-3.5 text-center text-xs font-bold text-warning">
            Sua conta ainda não está vinculada a um jogador selecionável. Você pode contratar amigos ou pedir ao ADM para vincular seu perfil.
          </div>
        )}
      </section>

      {/* 3. PAINEL DE CONTRATAÇÃO DE AMIGO (CONVIDADO) & ADMIN */}
      {callup.status === "open" && (
        <section className="overflow-hidden rounded-2xl border border-accent/25 bg-accent/[0.04]">
          <button
            type="button"
            onClick={() => setIsHireGuestOpen((prev) => !prev)}
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent/[0.08]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-black text-foreground">Contratar Amigo (Convidado)</p>
                <p className="text-[10px] text-muted">Adicione um amigo para entrar na lista ou na fila de espera</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-accent">
              <span className="text-[10px] font-bold hidden sm:inline">
                {isHireGuestOpen ? "Recolher" : "Contratar"}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  isHireGuestOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isHireGuestOpen && (
            <div className="p-4 pt-0 space-y-3 animate-fade-in border-t border-accent/15">
              {/* Formulário de criação de perfil de convidado */}
              {isAuthenticated ? (
                <form onSubmit={handleInviteGuest} className="space-y-2 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Nome do amigo / convidado..."
                      required
                      className="sm:col-span-6 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-accent outline-none"
                    />
                    <select
                      value={guestProfile}
                      onChange={(e) => setGuestProfile(e.target.value as PlayerProfile)}
                      className="sm:col-span-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent outline-none"
                    >
                      <option value="midfield">Meio-Campo</option>
                      <option value="offensive">Ataque</option>
                      <option value="defensive">Defesa</option>
                    </select>
                    <button
                      type="submit"
                      disabled={loading === "guest" || !guestName.trim()}
                      className="sm:col-span-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-black text-background transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loading === "guest" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      Contratar Amigo
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isGuestGk}
                        onChange={(e) => setIsGuestGk(e.target.checked)}
                        className="rounded border-border bg-background text-accent focus:ring-accent"
                      />
                      <span>É goleiro</span>
                    </label>
                    <span className="text-[10px] text-muted/60 ml-auto">
                      {confirmed.length < capacity ? "Entrará como Titular" : "Entrará na Fila de Espera"}
                    </span>
                  </div>
                </form>
              ) : (
                <div className="text-center pt-3 text-[11px] text-muted">
                  <Link href="/login?next=/convocacao" className="text-accent font-bold hover:underline">
                    Faça login
                  </Link>{" "}
                  para cadastrar e convidar amigos para a pelada.
                </div>
              )}

              {/* Qualquer conta logada pode incluir alguém do elenco jogável. */}
              {isAuthenticated && availableToAdmin.length > 0 && (
                <div className="pt-3 border-t border-accent/15 flex gap-2">
                  <select
                    id="admin-callup-player"
                    defaultValue=""
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                  >
                    <option value="" disabled>
                      Adicionar alguém do elenco...
                    </option>
                    {availableToAdmin.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                        {player.member_category === "guest" ? " (convidado)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const select = document.getElementById("admin-callup-player") as HTMLSelectElement;
                      if (select?.value) run("add", () => addRosterPlayerToCallup(callup.id, select.value));
                    }}
                    disabled={!!loading}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent hover:bg-accent hover:text-background transition-colors"
                    title="Adicionar à convocação"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4. LISTA DE JOGADORES COM ABAS (CONFIRMADOS VS FILA DE ESPERA) */}
      <section className="space-y-3">
        {/* Seletor de Abas */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-black/40 p-1 border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab("confirmed")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
              activeTab === "confirmed"
                ? "bg-accent text-background font-black shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Confirmados ({confirmed.length}/{capacity})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("waitlist")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
              activeTab === "waitlist"
                ? "bg-warning text-background font-black shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Fila ({waitlist.length})</span>
          </button>
        </div>

        {/* Conteúdo da Aba Ativa */}
        {activeTab === "confirmed" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {confirmed.map((entry, index) => {
                const isMe = entry.player_id === currentPlayerId;
                const isMyGuest = Boolean(
                  currentUserId &&
                    (entry.joined_by === currentUserId ||
                      (entry.player as any)?.created_by_user_id === currentUserId)
                );
                const canRemove = (isAdmin || isMyGuest) && callup.status === "open";

                return (
                  <div
                    key={entry.id}
                    className={`relative flex items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                      isMe
                        ? "border-accent/50 bg-accent/[0.08]"
                        : "border-border bg-surface/70 hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-athletic text-xs font-black ${
                        isMe ? "bg-accent text-background" : "bg-surface text-muted border border-border"
                      }`}
                    >
                      {index + 1}
                    </span>

                    <PlayerAvatar
                      name={entry.player.name}
                      avatarUrl={entry.player.avatar_url}
                      className="h-9 w-9 shrink-0 rounded-full bg-surface text-xs font-black text-muted"
                    />

                    <div className="min-w-0 flex-1 pr-6">
                      <p className="truncate text-xs font-black text-foreground">
                        {entry.player.name}{" "}
                        {isMe && <span className="text-[10px] text-accent font-normal">(você)</span>}
                        {isMyGuest && !isMe && <span className="text-[10px] text-accent font-normal">(seu amigo)</span>}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted">
                        <PlayerProfileBadge profile={entry.player.player_profile} isGoalkeeper={entry.player.is_goalkeeper} />
                        {entry.player.member_category === "guest" && (
                          <span className="rounded bg-warning/20 px-1 py-0.2 text-[8px] font-black text-warning uppercase">
                            Convidado
                          </span>
                        )}
                      </div>
                    </div>

                    {canRemove && (
                      <button
                        onClick={() => run(`remove-${entry.id}`, () => removeCallupEntry(callup.id, entry.player_id))}
                        disabled={!!loading}
                        className="absolute right-2 top-2.5 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                        title={isMyGuest ? "Remover meu convidado" : `Remover ${entry.player.name}`}
                        aria-label={`Remover ${entry.player.name}`}
                      >
                        {loading === `remove-${entry.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vagas Livres Compactas */}
            {remainingSlots > 0 && (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 p-3 text-center">
                <p className="text-xs font-black text-muted">
                  + {remainingSlots} vaga(s) titular(es) disponível(is)
                </p>
                <p className="text-[10px] text-muted/70 mt-0.5">
                  Garanta sua vaga antes que o limite de {capacity} jogadores seja atingido.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Aba da Fila de Espera */
          <div className="space-y-2">
            {waitlist.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {waitlist.map((entry, index) => {
                  const isMe = entry.player_id === currentPlayerId;
                  const isMyGuest = Boolean(
                    currentUserId &&
                      (entry.joined_by === currentUserId ||
                        (entry.player as any)?.created_by_user_id === currentUserId)
                  );
                  const canRemove = (isAdmin || isMyGuest) && callup.status === "open";

                  return (
                    <div
                      key={entry.id}
                      className={`relative flex items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                        isMe
                          ? "border-warning/50 bg-warning/[0.08]"
                          : "border-border bg-surface/70 hover:bg-surface"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-athletic text-xs font-black ${
                          isMe ? "bg-warning text-background" : "bg-surface text-muted border border-border"
                        }`}
                      >
                        #{index + 1}
                      </span>

                      <PlayerAvatar
                        name={entry.player.name}
                        avatarUrl={entry.player.avatar_url}
                        className="h-9 w-9 shrink-0 rounded-full bg-surface text-xs font-black text-muted"
                      />

                      <div className="min-w-0 flex-1 pr-6">
                        <p className="truncate text-xs font-black text-foreground">
                          {entry.player.name}{" "}
                          {isMe && <span className="text-[10px] text-warning font-normal">(você)</span>}
                          {isMyGuest && !isMe && <span className="text-[10px] text-warning font-normal">(seu amigo)</span>}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted">
                          <PlayerProfileBadge profile={entry.player.player_profile} isGoalkeeper={entry.player.is_goalkeeper} />
                          {entry.player.member_category === "guest" && (
                            <span className="rounded bg-warning/20 px-1 py-0.2 text-[8px] font-black text-warning uppercase">
                              Convidado
                            </span>
                          )}
                        </div>
                      </div>

                      {canRemove && (
                        <button
                          onClick={() => run(`remove-${entry.id}`, () => removeCallupEntry(callup.id, entry.player_id))}
                          disabled={!!loading}
                          className="absolute right-2 top-2.5 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                          title={isMyGuest ? "Remover meu convidado da fila" : `Remover ${entry.player.name}`}
                          aria-label={`Remover ${entry.player.name}`}
                        >
                          {loading === `remove-${entry.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card p-6 text-center text-xs text-muted">
                Nenhum jogador na fila de espera no momento.
              </div>
            )}
          </div>
        )}
      </section>

      {/* POPUP PÓS-CONFIRMAÇÃO: CHAMADA PARA O CARTOLA */}
      {showCartolaPopup && (
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setShowCartolaPopup(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Presença confirmada"
          >
            <button
              onClick={() => setShowCartolaPopup(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-background shadow-[0_0_30px_rgba(204,255,0,0.3)]">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div className="mt-4 text-center">
              <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-accent">
                Presença Confirmada!
              </span>
              <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic leading-tight text-white">
                Você está escalado!
              </h2>
              <p className="mt-1 text-xs text-muted">
                Sua vaga de titular está garantida para a pelada. Agora escale seu time no Cartola antes do fechamento!
              </p>
            </div>

            {/* Destaques do Cartola */}
            <div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-warning">
                  <Sparkles className="h-3.5 w-3.5" /> Destaques do Cartola
                </span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-black uppercase text-accent">
                  Mercado Aberto
                </span>
              </div>

              {fantasyHighlights?.topScorer && (
                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Trophy className="h-3.5 w-3.5 text-yellow-400" /> Mito Anterior
                  </span>
                  <span className="font-black text-foreground">
                    {fantasyHighlights.topScorer.name}{" "}
                    <strong className="text-accent">({fantasyHighlights.topScorer.points.toFixed(1)} pts)</strong>
                  </span>
                </div>
              )}

              {fantasyHighlights?.topGain && (
                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Maior Valorização
                  </span>
                  <span className="font-black text-emerald-400">
                    {fantasyHighlights.topGain.name} (+{(fantasyHighlights.topGain.variation * 100).toFixed(0)}%)
                  </span>
                </div>
              )}

              {fantasyHighlights?.topDrop && (
                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-400" /> Maior Desvalorização
                  </span>
                  <span className="font-black text-rose-400">
                    {fantasyHighlights.topDrop.name} ({(fantasyHighlights.topDrop.variation * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <Link
                href="/cartola"
                onClick={() => setShowCartolaPopup(false)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
              >
                <Crown className="h-4 w-4" /> Escalar no Cartola Agora
              </Link>
              <button
                onClick={() => setShowCartolaPopup(false)}
                className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-bold text-muted hover:text-foreground transition-colors"
              >
                Ver convocação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição da Convocação (ADM) */}
      {editingCallup && (
        <div
          className="mobile-dialog-backdrop bg-black/75 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && !editLoading && setEditingCallup(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Editar Convocação"
            className="mobile-dialog-panel max-w-md rounded-3xl border border-border bg-background p-5 shadow-2xl animate-fade-in-up"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <PencilLine className="h-5 w-5 text-accent" />
                <h2 className="text-base font-black text-foreground">Editar Convocação</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingCallup(false)}
                className="rounded-full bg-surface p-1 text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div className="mt-3 rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
                {editError}
              </div>
            )}

            <form action={handleEditCallup} className="mt-4 space-y-3.5">
              <input type="hidden" name="callup_id" value={callup.id} />

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Data da Pelada</label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={callup.date}
                    className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground [appearance:none]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Horário de Início</label>
                  <input
                    type="time"
                    name="start_time"
                    required
                    defaultValue={callup.start_time?.slice(0, 5) || "08:00"}
                    className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground [appearance:none]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Campo / Estádio</label>
                <select
                  name="stadium_id"
                  defaultValue={callup.stadium_id || (stadiums && stadiums[0]?.id) || ""}
                  className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground"
                >
                  {stadiums && stadiums.length > 0 ? (
                    stadiums.map((stadium) => (
                      <option key={stadium.id} value={stadium.id}>
                        {stadium.name} {stadium.address ? `(${stadium.address})` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">Estádio Padrão da Liga</option>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Tipo de Rodada</label>
                <select
                  name="round_type"
                  defaultValue={callup.round_type}
                  className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground"
                >
                  <option value="official">Oficial (Ranked)</option>
                  <option value="friendly">Amistoso</option>
                </select>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCallup(false)}
                  className="rounded-xl border border-border py-3 text-xs font-bold text-foreground hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-xl bg-accent py-3 text-xs font-black text-background transition-transform active:scale-[0.99] disabled:opacity-50"
                >
                  {editLoading ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ALERTA DE POSIÇÃO NO PERFIL (RODADA 02) */}
      <CallupTacticalAlertModal />
    </div>
  );
}
