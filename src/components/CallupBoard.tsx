"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Crown,
  ExternalLink,
  Loader2,
  LogIn,
  MapPin,
  PencilLine,
  Plus,
  Shield,
  Share2,
  Shirt,
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
  addRosterPlayersToCallup,
  adminRemoveCallupPlayer,
  inviteGuestToCallup,
  inviteGuestListToCallup,
  joinActiveCallup,
  leaveActiveCallup,
  removeCallupEntry,
  repairMyPlayerAccount,
  setCallupVisibility,
  updateCallup,
  createCallupPrelist,
  type CallupWithEntries,
} from "@/lib/actions/callups";
import type { Player, PlayerProfile, Stadium } from "@/lib/types";
import type { FantasyQuickHighlight } from "@/lib/actions/fantasy";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";
import { TeamReferenceBadge } from "./TeamReferenceBadge";
import { getTeamReference } from "@/lib/team-reference";
import { RoundCalendarButton } from "./RoundCalendarButton";
import { CallupTacticalAlertModal } from "./CallupTacticalAlertModal";
import { useDialogViewport } from "@/lib/useDialogViewport";
import type { EquippedCosmeticsSummary } from "@/lib/actions/cosmetics";
import Image from "next/image";
import { cosmeticBackgroundPosition, cosmeticHighResolutionImage } from "@/lib/fantasy/cosmetics";
import { useUrlState } from "@/lib/useUrlState";
import { hasCallupClosingMatch } from "@/lib/callup-lifecycle";
import { WeatherBadge } from "./WeatherBadge";
import type { EventWeather } from "@/lib/weather";
import { setCallupFormat } from "@/lib/actions/rounds";
import { buildCallupInviteMessage, buildCallupInviteUrl, shareCallupInvite } from "@/lib/callup-invite";
import {
  MAX_CALLUP_GUEST_LIST_SIZE,
  normalizeCallupGuestName,
  parseWhatsAppGuestList,
} from "@/modules/callups/domain/callup-guest-list";
import { RoundSetupSteps } from "./RoundSetupSteps";
import { DelayedPitchLoadingOverlay } from "./DelayedPitchLoadingOverlay";
import { saveStadium } from "@/lib/actions/stadiums";

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
  playerCosmetics?: Record<string, EquippedCosmeticsSummary>;
  initialListTab?: "confirmed" | "waitlist";
  initialPlayerSetupOpen?: boolean;
  cartolaEnabled?: boolean;
  loginReturnTo?: string;
  weather?: EventWeather | null;
  soloMode?: boolean;
};
const CALLUP_LIST_TABS = ["confirmed", "waitlist"] as const;

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
  playerCosmetics = {},
  initialListTab = "confirmed",
  initialPlayerSetupOpen = false,
  cartolaEnabled = true,
  loginReturnTo = "/convocacao",
  weather,
  soloMode = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [showCartolaPopup, setShowCartolaPopup] = useState(false);
  const [showWaitlistPopup, setShowWaitlistPopup] = useState(false);
  const [editingCallup, setEditingCallup] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editableStadiums, setEditableStadiums] = useState(stadiums);
  const [editStadiumId, setEditStadiumId] = useState(callup.stadium_id || stadiums[0]?.id || "");
  const [showEditStadium, setShowEditStadium] = useState(stadiums.length === 0);
  const [newEditStadiumName, setNewEditStadiumName] = useState("");
  const [newEditStadiumAddress, setNewEditStadiumAddress] = useState("");
  const [newEditStadiumMapUrl, setNewEditStadiumMapUrl] = useState("");
  const [editStadiumLoading, setEditStadiumLoading] = useState(false);
  const [editStadiumError, setEditStadiumError] = useState("");
  const [formatPlayers, setFormatPlayers] = useState(callup.players_per_team || Math.round(callup.capacity / (callup.teams_per_round || 3)));
  const [formatTeams, setFormatTeams] = useState(callup.teams_per_round || 3);
  const [formatNotice, setFormatNotice] = useState("");
  const [activeTab, setActiveTab] = useUrlState({ key: "list", initialValue: initialListTab, defaultValue: "confirmed", allowedValues: CALLUP_LIST_TABS });

  // Estado para Contratação de Amigo (Convidado)
  const [isHireGuestOpen, setIsHireGuestOpen] = useState(initialPlayerSetupOpen);
  const [guestName, setGuestName] = useState("");
  const [guestProfile, setGuestProfile] = useState<PlayerProfile>("offensive");
  const [isGuestGk, setIsGuestGk] = useState(false);
  const [isGuestListOpen, setIsGuestListOpen] = useState(false);
  const [guestListText, setGuestListText] = useState("");
  const [guestListNotice, setGuestListNotice] = useState("");
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());

  useDialogViewport(editingCallup, () => !editLoading && setEditingCallup(false));
  useDialogViewport(showWaitlistPopup, () => setShowWaitlistPopup(false));

  const confirmed = callup.entries.filter((entry) => entry.status === "confirmed");
  const waitlist = callup.entries.filter((entry) => entry.status === "waitlist");
  const capacity = callup.capacity;
  const myEntry = callup.entries.find((entry) => entry.player_id === currentPlayerId);
  const myPosition = myEntry
    ? (myEntry.status === "confirmed"
        ? confirmed.findIndex((e) => e.id === myEntry.id) + 1
        : waitlist.findIndex((e) => e.id === myEntry.id) + 1)
    : null;

  const availablePlayers = selectablePlayers.filter(
    (player) => !callup.entries.some((entry) => entry.player_id === player.id)
  );
  const existingPlayerNameKeys = useMemo(() => new Set(
    [...selectablePlayers, ...callup.entries.map((entry) => entry.player)]
      .map((player) => normalizeCallupGuestName(player.name)),
  ), [callup.entries, selectablePlayers]);
  const parsedGuestList = useMemo(() => parseWhatsAppGuestList(guestListText), [guestListText]);
  const readyGuestList = useMemo(
    () => parsedGuestList.filter((guest) => !existingPlayerNameKeys.has(normalizeCallupGuestName(guest.name))),
    [existingPlayerNameKeys, parsedGuestList],
  );
  const existingGuestList = useMemo(
    () => parsedGuestList.filter((guest) => existingPlayerNameKeys.has(normalizeCallupGuestName(guest.name))),
    [existingPlayerNameKeys, parsedGuestList],
  );

  const startTime = callup.start_time ? callup.start_time.slice(0, 5) : "08:00";
  const formattedFullDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${callup.date}T12:00:00`));

  const progressPercent = Math.min(100, Math.round((confirmed.length / capacity) * 100));
  const remainingSlots = Math.max(0, capacity - confirmed.length);
  const drawnTeams = callup.round?.teams || [];
  const myDrawnTeam = currentPlayerId
    ? drawnTeams.find((team) => team.team_players.some((entry) => entry.player_id === currentPlayerId)) || null
    : null;
  const hasDrawnTeams = callup.status === "converted" && drawnTeams.length > 0;
  const isQueueOnlyAfterDraw = callup.status === "converted";
  const canJoinCallup = callup.status === "open" || isQueueOnlyAfterDraw;
  const hasStartedMatch = hasCallupClosingMatch(callup.round?.matches);
  const canLeaveBeforeFirstMatch = (callup.status === "open" || callup.status === "converted") && !hasStartedMatch;

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

  async function createEditStadium() {
    setEditStadiumLoading(true);
    setEditStadiumError("");
    const formData = new FormData();
    formData.set("name", newEditStadiumName);
    formData.set("address", newEditStadiumAddress);
    formData.set("google_maps_url", newEditStadiumMapUrl);
    const result = await saveStadium(formData);
    if (!result.success) {
      setEditStadiumError(result.error || "Não foi possível cadastrar o campo.");
    } else {
      setEditableStadiums((current) => [...current, result.stadium]);
      setEditStadiumId(result.stadium.id);
      setShowEditStadium(false);
      setNewEditStadiumName("");
      setNewEditStadiumAddress("");
      setNewEditStadiumMapUrl("");
      router.refresh();
    }
    setEditStadiumLoading(false);
  }

  async function run(key: string, action: () => Promise<{ success: boolean; error?: string; status?: "confirmed" | "waitlist" }>) {
    setLoading(key);
    setError("");
    const result = await action();
    if (!result.success) {
      setError(result.error || "Não foi possível atualizar a lista.");
    } else {
      if (cartolaEnabled && key === "join" && result.status === "confirmed") {
        setShowCartolaPopup(true);
      }
      if (key === "join" && result.status === "waitlist" && callup.round_type === "official") {
        setShowWaitlistPopup(true);
        setActiveTab("waitlist");
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

  async function handleInviteGuestList() {
    if (readyGuestList.length === 0 || readyGuestList.length > MAX_CALLUP_GUEST_LIST_SIZE) return;
    setLoading("guest-list");
    setError("");
    setGuestListNotice("");
    const result = await inviteGuestListToCallup({
      callupId: callup.id,
      text: guestListText,
      playerProfile: guestProfile,
    });
    if (!result.success) {
      setError(result.error || "Não foi possível importar a lista.");
    } else {
      const summary = [
        `${result.created} ${result.created === 1 ? "convidado criado" : "convidados criados"}`,
        result.confirmed > 0 ? `${result.confirmed} na lista principal` : "",
        result.waitlisted > 0 ? `${result.waitlisted} na fila` : "",
        result.ignoredExisting.length > 0 ? `${result.ignoredExisting.length} já existiam no elenco` : "",
        result.failed.length > 0 ? `${result.failed.length} não adicionados` : "",
      ].filter(Boolean).join(" · ");
      setGuestListNotice(summary);
      setGuestListText(result.failed.map((item) => item.name).join("\n"));
      router.refresh();
    }
    setLoading("");
  }

  async function handleInviteRosterPlayers() {
    if (!selectedRosterIds.size) return;
    const ids = [...selectedRosterIds];
    setLoading("add-many");
    setError("");
    const result = await addRosterPlayersToCallup(callup.id, ids);
    if (!result.success) setError(result.error || "Não foi possível adicionar os jogadores.");
    else {
      setSelectedRosterIds(new Set());
      if (result.failed) setError(result.error || "Alguns jogadores não puderam ser adicionados.");
      router.refresh();
    }
    setLoading("");
  }

  async function continueToDraw() {
    setLoading("draw");
    setError("");
    const result = await createCallupPrelist(callup.id);
    if (!result.success) {
      setError(result.error || "Não foi possível preparar o sorteio.");
      setLoading("");
      return;
    }
    router.push(`/admin/rodada?round=${result.roundId}&mount=1`);
  }

  async function copyInvite() {
    const type = callup.round_type === "friendly" ? "Amistoso" : "Pelada Oficial (Ranked)";
    const dateFormatted = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`));
    const inviteUrl = buildCallupInviteUrl(window.location.origin, callup.invite_token);
    const text = buildCallupInviteMessage({
      url: inviteUrl,
      heading: "CONVOCAÇÃO ABERTA",
      roundLabel: type,
      date: dateFormatted,
      time: startTime,
      stadiumName,
    });
    const result = await shareCallupInvite({
      title: `Convocação aberta · ${type}`,
      text,
    });
    if (result === "cancelled") return;
    setLoading("shared");
    setTimeout(() => setLoading(""), 1600);
  }

  async function copyWhatsAppList() {
    const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`));
    const numberedPlayers = Array.from({ length: capacity }, (_, index) =>
      `${index + 1}. ${confirmed[index]?.player.name || ""}`,
    );
    const numberedWaitlist = Array.from({ length: callup.waitlist_capacity }, (_, index) =>
      `${index + 1}. ${waitlist[index]?.player.name || ""}`,
    );
    const text = [
      `⚽ *Pelada BQ – ${date} - ${startTime}*`,
      "",
      ...numberedPlayers,
      "",
      "*Lista de espera*",
      ...numberedWaitlist,
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setLoading("copied-list");
    setTimeout(() => setLoading(""), 1600);
  }

  async function handleFormatChange() {
    setLoading("format");
    setError("");
    setFormatNotice("");
    const result = await setCallupFormat(callup.id, formatPlayers, formatTeams);
    if (!result.success) {
      setError(result.error || "Não foi possível alterar o formato da convocação.");
    } else {
      setFormatNotice(result.fantasySizePreserved
        ? "Formato da pelada atualizado. Escalações já salvas no Cartola mantêm o formato anterior desta rodada."
        : `Formato atualizado: ${formatTeams} times de ${formatPlayers} jogadores.`);
      router.refresh();
    }
    setLoading("");
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip pb-6">
      <DelayedPitchLoadingOverlay active={loading === "draw"} delayMs={250} title="Preparando o sorteio" description="Levando os jogadores confirmados para a divisão dos times…" />
      <RoundSetupSteps activeStep={2} className="mb-1" />
      {/* 1. HERO CARD DA CONVOCAÇÃO */}
      <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/15 via-[#07150d] to-surface p-4 sm:p-5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 font-athletic text-[10px] font-black uppercase tracking-wider text-background">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-background" />
                {callup.status === "locked" ? "Lista Fechada" : isQueueOnlyAfterDraw ? "Times Sorteados · Fila Aberta" : "Convocação Aberta"}
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-black/40 px-2.5 py-0.5 text-[10px] font-bold text-muted uppercase">
                {soloMode ? "Sessão privada" : callup.round_type === "friendly" ? "Amistoso" : "Ranked"}
              </span>
              {isAdmin && !soloMode && (
                <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${callup.is_public ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"}`}>
                  <Shield className="h-3 w-3" /> {callup.is_public ? "Lista pública" : "Só convite"}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-xl font-black text-foreground capitalize leading-tight">
              {formattedFullDate}
            </h1>
          </div>

          {/* Botões de Ação do Topo */}
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            <RoundCalendarButton
              event={{
                title: `Pelada BQ - ${callup.round_type === "friendly" ? "Amistoso" : "Rodada Oficial"}`,
                date: callup.date,
                startTime: startTime,
                durationMinutes: 120,
                location: stadiumName || undefined,
                mapUrl: stadiumMapUrl || undefined,
                appUrl: `/convocacao?callup=${callup.id}`,
              }}
              variant="glass"
            />
            {isAdmin && !soloMode && (
              <button
                type="button"
                onClick={() => run("visibility", () => setCallupVisibility(callup.id, !callup.is_public))}
                disabled={!!loading}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-black uppercase transition-colors disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-2.5 ${callup.is_public ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25" : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"}`}
                title={callup.is_public ? "Fechar lista para convidados" : "Abrir lista para todos"}
                aria-label={callup.is_public ? "Fechar lista para convidados" : "Abrir lista para todos"}
              >
                {loading === "visibility" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                <span className="hidden sm:inline">{callup.is_public ? "Pública" : "Privada"}</span>
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setEditStadiumId(callup.stadium_id || editableStadiums[0]?.id || "");
                  setShowEditStadium(editableStadiums.length === 0);
                  setEditStadiumError("");
                  setEditingCallup(true);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-muted hover:text-accent hover:border-accent/40 transition-colors"
                title="Editar convocação"
                aria-label="Editar convocação"
              >
                <PencilLine className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={copyWhatsAppList}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors shadow-sm"
              title="Copiar lista para WhatsApp"
              aria-label="Copiar lista para WhatsApp"
            >
              {loading === "copied-list" ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
            </button>
            {!soloMode && <button
              onClick={copyInvite}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors shadow-sm"
              title="Compartilhar convite"
              aria-label="Compartilhar convite"
            >
              {loading === "shared" ? <CheckCircle2 className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            </button>}
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
          <WeatherBadge weather={weather} locationName={stadiumName} />
        </div>

        {hasDrawnTeams && callup.round_id && (
          <Link
            href={`/rodadas/${callup.round_id}`}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-accent/45 bg-[linear-gradient(120deg,rgba(204,255,0,.18),rgba(5,29,15,.82)_55%,rgba(9,49,27,.8))] p-3.5 shadow-[0_0_24px_rgba(204,255,0,.12)] transition-transform hover:border-accent/75 active:scale-[.99]"
            aria-label={myDrawnTeam ? `Ver meu time: ${myDrawnTeam.name}` : "Ver times sorteados"}
          >
            {myDrawnTeam ? (
              <TeamReferenceBadge position={myDrawnTeam.position} color={myDrawnTeam.color} className="h-14 w-14 bg-black/25 text-3xl text-white shadow-[0_0_15px_rgba(204,255,0,.2)]" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-accent/60 bg-black/25 text-accent"><Shirt className="h-5 w-5" /></span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-[.15em] text-accent">Times já sorteados</span>
              <span className="mt-0.5 block truncate text-base font-black text-foreground">
                {myDrawnTeam ? `Você ficou no Time ${getTeamReference(myDrawnTeam)}` : "Veja como ficaram os times da rodada"}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold text-muted">
                {myDrawnTeam ? `${myDrawnTeam.name} · toque para ver a escalação completa.` : "Toque para ver a escalação completa."}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-accent" />
          </Link>
        )}

        {(!myEntry || soloMode) && <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
          <span className="shrink-0 text-xs font-black text-foreground"><strong className="text-accent">{confirmed.length}</strong>/{capacity}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="shrink-0 text-[10px] font-bold text-muted">{waitlist.length > 0 ? `${waitlist.length} na fila` : `${remainingSlots} vagas`}</span>
        </div>}
      </section>

      {/* 2. CTA DE AÇÃO / STATUS DO JOGADOR LOGADO */}
      {!soloMode && <section className="space-y-2">
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
            href={`/login?next=${encodeURIComponent(loginReturnTo)}`}
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

              {canLeaveBeforeFirstMatch ? (
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
              ) : (
                <span className="text-right text-[10px] font-bold text-muted">Lista encerrada<br />após o início do jogo</span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3 border-t border-accent/20 pt-2.5">
              <span className="shrink-0 text-[11px] font-black text-foreground"><strong className="text-accent">{confirmed.length}</strong>/{capacity}</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="shrink-0 text-[10px] font-bold text-muted">{waitlist.length > 0 ? `${waitlist.length} na fila` : `${remainingSlots} vagas`}</span>
            </div>

            {cartolaEnabled && myEntry.status === "confirmed" && (
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
        ) : currentPlayerId && canJoinCallup ? (
          /* Botão de Entrar na Lista (Confirmar Presença) */
          <button
            onClick={() => run("join", () => joinActiveCallup(callup.id))}
            disabled={!!loading}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black uppercase tracking-wider text-background shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50 ${
              !isQueueOnlyAfterDraw && confirmed.length < capacity
                ? "bg-accent shadow-[0_0_30px_rgba(204,255,0,0.3)] animate-pulse"
                : "bg-warning shadow-[0_0_30px_rgba(234,179,8,0.25)]"
            }`}
          >
            {loading === "join" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Confirmando...
              </>
            ) : !isQueueOnlyAfterDraw && confirmed.length < capacity ? (
              <>
                <CheckCircle2 className="h-5 w-5" /> Confirmar Minha Presença ({remainingSlots} vagas)
              </>
            ) : (
              <>
                <Clock className="h-5 w-5" /> Entrar na Fila de Espera (#{waitlist.length + 1})
              </>
            )}
          </button>
        ) : currentPlayerId ? (
          <div className="rounded-2xl border border-accent/25 bg-accent/[.06] p-4 text-center">
            <p className="text-xs font-black uppercase tracking-wider text-accent">Times já sorteados</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">Seu time aparece no destaque acima. Se alguém desistir antes do primeiro jogo, a vaga reabre aqui no mesmo time.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-warning/25 bg-warning/10 p-3.5 text-center text-xs font-bold text-warning">
            <p>Seu cadastro de jogador ainda não foi concluído.</p>
            <button
              type="button"
              onClick={() => run("repair-profile", repairMyPlayerAccount)}
              disabled={!!loading}
              className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-warning px-4 py-2 font-black text-background disabled:opacity-50"
            >
              {loading === "repair-profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Concluir meu cadastro
            </button>
          </div>
        )}
      </section>}

      {/* 3. FLUXO SIMPLES PARA ADICIONAR JOGADORES */}
      {soloMode && error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger animate-fade-in">
          {error}
        </div>
      )}
      {canJoinCallup && (
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
                <p className="text-xs font-black text-foreground">{soloMode ? "Adicionar quem vai jogar" : "Adicionar jogador à convocação"}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-accent">
              <span className="text-[10px] font-bold hidden sm:inline">
                {isHireGuestOpen ? "Fechar" : "Adicionar"}
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
              {isAuthenticated ? (
                <div className="space-y-4 pt-3">
                  {availablePlayers.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase text-accent">Do elenco</p>
                      <div className="overflow-hidden rounded-xl border border-border bg-background/60">
                        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                          <span className="text-[10px] font-bold text-muted">Marque um ou vários jogadores</span>
                          <button
                            type="button"
                            onClick={() => setSelectedRosterIds((current) => current.size === availablePlayers.length ? new Set() : new Set(availablePlayers.map((player) => player.id)))}
                            className="text-[10px] font-black text-accent"
                          >
                            {selectedRosterIds.size === availablePlayers.length ? "Limpar" : "Marcar todos"}
                          </button>
                        </div>
                        <div className="grid max-h-52 grid-cols-1 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
                          {availablePlayers.map((player) => (
                            <label key={player.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold ${selectedRosterIds.has(player.id) ? "border-accent/60 bg-accent/10 text-foreground" : "border-transparent text-muted hover:bg-surface"}`}>
                              <input
                                type="checkbox"
                                checked={selectedRosterIds.has(player.id)}
                                onChange={(event) => setSelectedRosterIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(player.id);
                                  else next.delete(player.id);
                                  return next;
                                })}
                                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                              />
                              <span className="min-w-0 flex-1 truncate">{player.name}</span>
                              {player.member_category === "guest" && <span className="text-[8px] uppercase text-warning">Convidado</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleInviteRosterPlayers}
                        disabled={!!loading || selectedRosterIds.size === 0}
                        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-xs font-black text-background disabled:opacity-50"
                      >
                        {loading === "add-many" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                        {selectedRosterIds.size > 0 ? `Adicionar ${selectedRosterIds.size} selecionado${selectedRosterIds.size === 1 ? "" : "s"}` : "Selecione os jogadores"}
                      </button>
                      </div>
                  )}

                  <form onSubmit={handleInviteGuest} className="space-y-2 border-t border-accent/15 pt-3">
                    <div>
                      <p className="text-[10px] font-black uppercase text-accent">Novo convidado</p>
                    </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Nome do convidado"
                      required
                      className="sm:col-span-6 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-accent outline-none"
                    />
                    <select
                      value={guestProfile}
                      onChange={(e) => setGuestProfile(e.target.value as PlayerProfile)}
                      className="sm:col-span-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent outline-none"
                    >
                      <option value="offensive">Ataque / Ala</option>
                      <option value="defensive">Defesa / Volante</option>
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
                      Criar e adicionar
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
                      {!isQueueOnlyAfterDraw && confirmed.length < capacity ? "Entrará como Titular" : "Entrará na Fila de Espera"}
                    </span>
                  </div>
                  </form>

                  {isAdmin && (
                    <div className="border-t border-accent/15 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsGuestListOpen((open) => !open);
                          setGuestListNotice("");
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-3 text-left transition-colors hover:border-accent/35 hover:bg-accent/[0.08]"
                        aria-expanded={isGuestListOpen}
                        aria-controls="whatsapp-guest-list"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
                            <ClipboardList className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-black text-foreground">Colar lista do WhatsApp</span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-muted">Crie todos os convidados de uma vez</span>
                          </span>
                        </span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-accent transition-transform ${isGuestListOpen ? "rotate-180" : ""}`} />
                      </button>

                      {isGuestListOpen && (
                        <div id="whatsapp-guest-list" className="mt-3 space-y-3 rounded-2xl border border-emerald-400/20 bg-black/20 p-3 animate-fade-in">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-300">Importação rápida</p>
                            <p className="mt-1 text-[10px] leading-4 text-muted">
                              Cole a lista como veio do WhatsApp. Numeração, marcadores, títulos e nomes repetidos serão tratados automaticamente. Use 🧤 ao lado do nome para marcar um goleiro.
                            </p>
                          </div>

                          <label className="block text-[10px] font-bold text-muted">
                            Posição inicial dos novos convidados
                            <select
                              value={guestProfile}
                              onChange={(event) => setGuestProfile(event.target.value as PlayerProfile)}
                              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none focus:border-accent"
                            >
                              <option value="offensive">Ataque / Ala</option>
                              <option value="defensive">Defesa / Volante</option>
                            </select>
                          </label>

                          <textarea
                            value={guestListText}
                            onChange={(event) => {
                              setGuestListText(event.target.value);
                              setGuestListNotice("");
                            }}
                            rows={7}
                            placeholder={"⚽ *Pelada BQ – 24/10 - 08:00*\n\n1. João Silva\n2. Pedro Santos\n3. Lucas 🧤"}
                            className="mobile-dialog-scroll w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-5 text-foreground outline-none placeholder:text-muted/50 focus:border-accent"
                            aria-label="Lista de convidados copiada do WhatsApp"
                          />

                          {parsedGuestList.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-surface/70 p-3">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                                <span className="rounded-full bg-accent/15 px-2 py-1 text-accent">{readyGuestList.length} novos</span>
                                {existingGuestList.length > 0 && (
                                  <span className="rounded-full bg-warning/15 px-2 py-1 text-warning">{existingGuestList.length} já existem</span>
                                )}
                                {parsedGuestList.filter((guest) => guest.isGoalkeeper).length > 0 && (
                                  <span className="rounded-full bg-sky-400/15 px-2 py-1 text-sky-300">🧤 {parsedGuestList.filter((guest) => guest.isGoalkeeper).length} goleiro(s)</span>
                                )}
                              </div>
                              <ul className="mobile-dialog-scroll mt-2 max-h-36 space-y-1 text-[10px] leading-4">
                                {parsedGuestList.map((guest) => {
                                  const exists = existingPlayerNameKeys.has(normalizeCallupGuestName(guest.name));
                                  return (
                                    <li key={normalizeCallupGuestName(guest.name)} className={exists ? "text-warning" : "text-foreground"}>
                                      {guest.isGoalkeeper ? "🧤 " : ""}{guest.name}{exists ? " · já está no elenco" : " · novo convidado"}
                                    </li>
                                  );
                                })}
                              </ul>
                              {existingGuestList.length > 0 && (
                                <p className="mt-2 border-t border-white/10 pt-2 text-[9px] leading-4 text-muted">
                                  Quem já está no elenco não será duplicado. Use “Escolha o jogador” acima para adicionar esse perfil.
                                </p>
                              )}
                            </div>
                          )}

                          {guestListNotice && (
                            <p className="rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-bold leading-4 text-accent" role="status">
                              {guestListNotice}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={handleInviteGuestList}
                            disabled={loading === "guest-list" || readyGuestList.length === 0 || readyGuestList.length > MAX_CALLUP_GUEST_LIST_SIZE}
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-background transition-transform active:scale-[.98] disabled:opacity-40"
                          >
                            {loading === "guest-list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            {readyGuestList.length > MAX_CALLUP_GUEST_LIST_SIZE
                              ? `Máximo de ${MAX_CALLUP_GUEST_LIST_SIZE} nomes`
                              : `Criar e adicionar ${readyGuestList.length} ${readyGuestList.length === 1 ? "convidado" : "convidados"}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center pt-3 text-[11px] text-muted">
                  <Link href={`/login?next=${encodeURIComponent(loginReturnTo)}`} className="text-accent font-bold hover:underline">
                    Faça login
                  </Link>{" "}
                  para cadastrar e convidar amigos para a pelada.
                </div>
              )}

            </div>
          )}
        </section>
      )}

      {soloMode && isAdmin && callup.status === "open" && callup.round_id && !hasDrawnTeams && (
        <section className="rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,rgba(204,255,0,.15),rgba(4,29,15,.92))] p-4 shadow-[0_0_28px_rgba(204,255,0,.1)]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-background"><Users className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wider text-accent">Lista pronta?</p>
              <p className="mt-1 text-xs leading-5 text-muted">{confirmed.length} jogador{confirmed.length === 1 ? "" : "es"} confirmado{confirmed.length === 1 ? "" : "s"}. Você ainda poderá ajustar a formação na próxima tela.</p>
            </div>
          </div>
          <Link href={`/admin/rodada?round=${callup.round_id}&mount=1`} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-background transition-transform active:scale-[.98]">
            Concluir lista e dividir times <ChevronRight className="h-4 w-4" />
          </Link>
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
                const cosmetic = playerCosmetics[entry.player_id];
                const bannerImage = cosmeticHighResolutionImage(cosmetic?.bannerAssetKey);
                const isMyGuest = Boolean(
                  currentUserId &&
                    (entry.joined_by === currentUserId ||
                      (entry.player as any)?.created_by_user_id === currentUserId)
                );
                const canRemove = callup.status === "open"
                  ? (isAdmin || isMyGuest)
                  : isAdmin && callup.status === "converted" && !hasStartedMatch;

                return (
                  <div
                    key={entry.id}
                    className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-2.5 transition-colors ${
                      isMe
                        ? "border-accent/50 bg-accent/[0.08]"
                        : "border-border bg-surface/70 hover:bg-surface"
                    }`}
                  >
                    {bannerImage && (
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-55">
                        <Image
                          src={bannerImage}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          quality={75}
                          className="object-cover"
                          style={{ objectPosition: cosmeticBackgroundPosition("banner", cosmetic?.bannerAssetKey) }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#06150d]/85 via-[#06150d]/60 to-[#06150d]/88" />
                      </div>
                    )}
                    <span
                      className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-athletic text-xs font-black ${
                        isMe ? "bg-accent text-background" : "bg-surface text-muted border border-border"
                      }`}
                    >
                      {index + 1}
                    </span>

                    <PlayerAvatar
                      name={entry.player.name}
                      playerId={entry.player.member_category === "player" ? entry.player_id : undefined}
                      avatarUrl={entry.player.avatar_url}
                      frameKey={playerCosmetics[entry.player_id]?.frameKey}
                      auraKey={playerCosmetics[entry.player_id]?.auraKey}
                      className="relative z-10 h-9 w-9 shrink-0 rounded-full bg-surface text-xs font-black text-muted"
                    />

                    <div className="relative z-10 min-w-0 flex-1 pr-6">
                      <p className="truncate text-xs font-black text-foreground">
                        {entry.player.name}{" "}
                        {isMe && <span className="text-[10px] text-accent font-normal">(você)</span>}
                        {entry.joined_by_name && <span className="text-[10px] text-accent font-normal">(amigo de {entry.joined_by_name})</span>}
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
                        className="absolute right-2 top-2.5 z-10 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
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
                  const cosmetic = playerCosmetics[entry.player_id];
                  const bannerImage = cosmeticHighResolutionImage(cosmetic?.bannerAssetKey);
                  const isMyGuest = Boolean(
                    currentUserId &&
                      (entry.joined_by === currentUserId ||
                        (entry.player as any)?.created_by_user_id === currentUserId)
                  );
                const canRemove = callup.status === "open"
                  ? (isAdmin || isMyGuest)
                  : isAdmin && callup.status === "converted" && !hasStartedMatch;

                  return (
                    <div
                      key={entry.id}
                      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-2.5 transition-colors ${
                        isMe
                          ? "border-warning/50 bg-warning/[0.08]"
                          : "border-border bg-surface/70 hover:bg-surface"
                      }`}
                    >
                      {bannerImage && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-55">
                          <Image
                            src={bannerImage}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 100vw, 50vw"
                            quality={75}
                            className="object-cover"
                            style={{ objectPosition: cosmeticBackgroundPosition("banner", cosmetic?.bannerAssetKey) }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-[#06150d]/85 via-[#06150d]/60 to-[#06150d]/88" />
                        </div>
                      )}
                      <span
                        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-athletic text-xs font-black ${
                          isMe ? "bg-warning text-background" : "bg-surface text-muted border border-border"
                        }`}
                      >
                        #{index + 1}
                      </span>

                      <PlayerAvatar
                        name={entry.player.name}
                        playerId={entry.player.member_category === "player" ? entry.player_id : undefined}
                        avatarUrl={entry.player.avatar_url}
                        frameKey={playerCosmetics[entry.player_id]?.frameKey}
                        auraKey={playerCosmetics[entry.player_id]?.auraKey}
                        className="relative z-10 h-9 w-9 shrink-0 rounded-full bg-surface text-xs font-black text-muted"
                      />

                      <div className="relative z-10 min-w-0 flex-1 pr-6">
                        <p className="truncate text-xs font-black text-foreground">
                          {entry.player.name}{" "}
                          {isMe && <span className="text-[10px] text-warning font-normal">(você)</span>}
                          {entry.joined_by_name && <span className="text-[10px] text-warning font-normal">(amigo de {entry.joined_by_name})</span>}
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
                          className="absolute right-2 top-2.5 z-10 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
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

      {isAdmin && callup.status === "open" && !hasDrawnTeams && (
        <section className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-accent/35 bg-[#07150d]/95 p-3 shadow-[0_-12px_32px_rgba(0,0,0,.45)] backdrop-blur-md sm:static sm:bg-surface">
          <button
            type="button"
            onClick={continueToDraw}
            disabled={!!loading || confirmed.length < 2}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-black text-background transition-transform active:scale-[.99] disabled:opacity-45"
          >
            {loading === "draw" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Continuar para o sorteio
            {loading !== "draw" && <ChevronRight className="h-4 w-4" />}
          </button>
          {confirmed.length < 2 && <p className="mt-2 text-center text-[10px] font-semibold text-warning">Adicione pelo menos 2 jogadores para continuar.</p>}
        </section>
      )}

      {showWaitlistPopup && (
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onMouseDown={(event) => event.target === event.currentTarget && setShowWaitlistPopup(false)}
        >
          <section
            className="relative w-full max-w-sm rounded-3xl border border-warning/40 bg-[#07150d] p-6 text-center shadow-[0_0_50px_rgba(0,0,0,.8)] animate-fade-in-up"
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-confirmation-title"
          >
            <button
              type="button"
              onClick={() => setShowWaitlistPopup(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-warning/40 bg-warning/15 text-warning shadow-[0_0_28px_rgba(250,204,21,.16)]">
              <Clock className="h-9 w-9" />
            </div>
            <p className="mt-4 font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-warning">Entrada registrada</p>
            <h2 id="waitlist-confirmation-title" className="mt-1 font-athletic text-2xl font-black uppercase italic leading-tight text-white">
              Você está na lista de espera
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              Sua posição atual é <strong className="text-warning">{waitlist.length + 1}ª</strong>. Se alguém sair da lista principal, sua vaga será promovida automaticamente.
            </p>
            <button
              type="button"
              onClick={() => setShowWaitlistPopup(false)}
              className="mt-5 w-full rounded-xl bg-warning py-3 text-xs font-black uppercase tracking-wider text-background transition-transform active:scale-[.98]"
            >
              Entendi
            </button>
          </section>
        </div>
      )}

      {/* POPUP PÓS-CONFIRMAÇÃO: CHAMADA PARA O CARTOLA */}
      {cartolaEnabled && showCartolaPopup && (
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

              <div className="space-y-1">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Campo / Estádio</label>
                <input type="hidden" name="stadium_id" value={editStadiumId} />
                <select
                  value={showEditStadium ? "__new__" : editStadiumId}
                  onChange={(event) => {
                    if (event.target.value === "__new__") {
                      setEditStadiumId("");
                      setShowEditStadium(true);
                      return;
                    }
                    setEditStadiumId(event.target.value);
                    setShowEditStadium(false);
                  }}
                  className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground"
                >
                  <option value="">Estádio padrão da liga</option>
                  {editableStadiums.map((stadium) => (
                    <option key={stadium.id} value={stadium.id}>
                      {stadium.name} {stadium.address ? `(${stadium.address})` : ""}
                    </option>
                  ))}
                  <option value="__new__">＋ Adicionar um novo campo</option>
                </select>
                {!showEditStadium && editableStadiums.length > 0 && (
                  <button type="button" onClick={() => setShowEditStadium(true)} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black text-accent">
                    <Plus className="h-3.5 w-3.5" /> Cadastrar outro campo
                  </button>
                )}
                {showEditStadium && (
                  <div className="mt-2 space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3 animate-fade-in">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black text-foreground">Novo campo</p>
                      {editableStadiums.length > 0 && <button type="button" onClick={() => setShowEditStadium(false)} aria-label="Fechar cadastro do campo" className="rounded-full p-1 text-muted"><X className="h-4 w-4" /></button>}
                    </div>
                    <input value={newEditStadiumName} onChange={(event) => setNewEditStadiumName(event.target.value)} placeholder="Nome do campo" className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground" />
                    <input value={newEditStadiumAddress} onChange={(event) => setNewEditStadiumAddress(event.target.value)} placeholder="Endereço (opcional)" className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground" />
                    <input type="url" value={newEditStadiumMapUrl} onChange={(event) => setNewEditStadiumMapUrl(event.target.value)} placeholder="Link do Google Maps" className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground" />
                    {editStadiumError && <p role="alert" className="text-[11px] font-bold text-danger">{editStadiumError}</p>}
                    <button
                      type="button"
                      onClick={createEditStadium}
                      disabled={editStadiumLoading || !newEditStadiumName.trim() || !newEditStadiumMapUrl.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs font-black text-background disabled:opacity-50"
                    >
                      {editStadiumLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {editStadiumLoading ? "Cadastrando..." : "Cadastrar e selecionar campo"}
                    </button>
                  </div>
                )}
              </div>

              {soloMode ? <input type="hidden" name="round_type" value="friendly" /> : <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Tipo de Rodada</label>
                <select
                  name="round_type"
                  defaultValue={callup.round_type}
                  className="block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground"
                >
                  <option value="official">Oficial (Ranked)</option>
                  <option value="friendly">Amistoso</option>
                </select>
              </div>}

              {callup.status === "open" && !hasDrawnTeams && (
                <fieldset className="rounded-2xl border border-accent/25 bg-accent/5 p-3">
                  <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-accent">Tamanho da pelada</legend>
                  <p className="mb-3 text-[10px] leading-4 text-muted">Ajuste as vagas antes de seguir para o sorteio.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-bold text-muted">Jogadores por time
                      <select value={formatPlayers} onChange={(event) => setFormatPlayers(Number(event.target.value))} disabled={!!loading} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground">
                        {[5, 6, 7].map((size) => <option key={size} value={size}>{size} × {size}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-bold text-muted">Quantidade de times
                      <select value={formatTeams} onChange={(event) => setFormatTeams(Number(event.target.value))} disabled={!!loading} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground">
                        {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} times</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="button" onClick={handleFormatChange} disabled={!!loading || (formatPlayers === callup.players_per_team && formatTeams === callup.teams_per_round)} className="mt-3 w-full rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-xs font-black text-accent disabled:opacity-40">
                    {loading === "format" ? "Salvando formato..." : `Aplicar ${formatTeams} times de ${formatPlayers}`}
                  </button>
                  {formatNotice && <p role="status" className="mt-2 text-[10px] font-semibold text-accent">{formatNotice}</p>}
                </fieldset>
              )}

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
                  disabled={editLoading || editStadiumLoading}
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
