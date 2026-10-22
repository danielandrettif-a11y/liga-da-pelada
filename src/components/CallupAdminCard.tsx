"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, ChevronRight, Clock, Loader2, Lock, MapPin, PencilLine, Plus, Share2, Stadium as StadiumIcon, X } from "@/components/icons";
import { closeCallup, createCallupPrelist, openCallup, setCallupVisibility, updateCallup, type CallupWithEntries } from "@/lib/actions/callups";
import { setCallupFormat } from "@/lib/actions/rounds";
import type { Stadium } from "@/lib/types";
import { buildCallupInviteMessage, buildCallupInviteUrl, shareCallupInvite } from "@/lib/callup-invite";
import { saveStadium } from "@/lib/actions/stadiums";
import { DelayedPitchLoadingOverlay } from "@/components/DelayedPitchLoadingOverlay";

export function CallupAdminCard({
  callups,
  stadiums = [],
  playersPerTeam = 5,
  teamsPerRound = 3,
  initialShowCreate = false,
}: {
  callups: CallupWithEntries[];
  stadiums?: Stadium[];
  playersPerTeam?: number;
  teamsPerRound?: number;
  initialShowCreate?: boolean;
}) {
  const router = useRouter();
  const [selectedCallupId, setSelectedCallupId] = useState(callups[0]?.id || "");
  const [showCreate, setShowCreate] = useState(initialShowCreate || callups.length === 0);
  const [continueOpening, setContinueOpening] = useState(callups.length === 0);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newPlayersPerTeam, setNewPlayersPerTeam] = useState([5, 6, 7].includes(playersPerTeam) ? playersPerTeam : 5);
  const [newTeamsPerRound, setNewTeamsPerRound] = useState(3);
  const [formatPlayersPerTeam, setFormatPlayersPerTeam] = useState<number | null>(null);
  const [formatTeamsPerRound, setFormatTeamsPerRound] = useState<number | null>(null);
  const [formatNotice, setFormatNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [availableStadiums, setAvailableStadiums] = useState(stadiums);
  const [selectedStadiumId, setSelectedStadiumId] = useState(stadiums[0]?.id || "");
  const [showQuickStadium, setShowQuickStadium] = useState(stadiums.length === 0);
  const [quickStadiumName, setQuickStadiumName] = useState("");
  const [quickStadiumAddress, setQuickStadiumAddress] = useState("");
  const [quickStadiumMapsUrl, setQuickStadiumMapsUrl] = useState("");
  const [quickStadiumLoading, setQuickStadiumLoading] = useState(false);
  const [quickStadiumError, setQuickStadiumError] = useState("");
  const callup = callups.find((item) => item.id === selectedCallupId) || callups[0] || null;
  const confirmed = callup?.entries.filter((entry) => entry.status === "confirmed").length || 0;
  const capacity = callup?.capacity || playersPerTeam * teamsPerRound;
  const waitlistCapacity = callup?.waitlist_capacity ?? 3;
  const conflictingCallup = callups.find((item) => item.date === newDate);
  const currentPlayersPerTeam = callup?.players_per_team || Math.max(1, Math.round(capacity / (callup?.teams_per_round || teamsPerRound)));
  const currentTeamsPerRound = callup?.teams_per_round || teamsPerRound;
  const canEditFormat = callup?.status === "open" && (!callup.round || (callup.round.status === "draft" && !callup.round.teams?.length));

  async function create(formData: FormData) {
    setLoading(true);
    setError("");
    const result = await openCallup(formData);
    if (!result.success) setError(result.error || "Erro ao abrir convocação.");
    else {
      setShowCreate(false);
      router.push(`/convocacao?callup=${result.id}&setup=players`);
    }
    setLoading(false);
  }

  async function createQuickStadium() {
    setQuickStadiumLoading(true);
    setQuickStadiumError("");
    const formData = new FormData();
    formData.set("name", quickStadiumName);
    formData.set("address", quickStadiumAddress);
    formData.set("google_maps_url", quickStadiumMapsUrl);
    const result = await saveStadium(formData);
    if (!result.success) {
      setQuickStadiumError(result.error || "Não foi possível cadastrar o campo.");
    } else {
      setAvailableStadiums((current) => [...current, result.stadium]);
      setSelectedStadiumId(result.stadium.id);
      setShowQuickStadium(false);
      setQuickStadiumName("");
      setQuickStadiumAddress("");
      setQuickStadiumMapsUrl("");
    }
    setQuickStadiumLoading(false);
  }

  async function handleEdit(formData: FormData) {
    setLoading(true);
    setError("");
    const result = await updateCallup(formData);
    if (!result.success) {
      setError(result.error || "Erro ao atualizar convocação.");
    } else {
      setEditing(false);
      router.refresh();
      setFormatPlayersPerTeam(null);
      setFormatTeamsPerRound(null);
    }
    setLoading(false);
  }

  async function close() {
    if (!callup || !confirm("Fechar esta convocação? A lista deixará de aparecer para todos.")) return;
    setLoading(true);
    const result = await closeCallup(callup.id);
    if (!result.success) setError(result.error || "Erro ao fechar convocação.");
    else router.refresh();
    setLoading(false);
  }

  async function toggleVisibility() {
    if (!callup) return;
    setLoading(true);
    setError("");
    const result = await setCallupVisibility(callup.id, !callup.is_public);
    if (!result.success) setError(result.error || "Erro ao atualizar a visibilidade.");
    else router.refresh();
    setLoading(false);
  }

  async function saveFormat() {
    if (!callup) return;
    const nextPlayers = formatPlayersPerTeam ?? currentPlayersPerTeam;
    const nextTeams = formatTeamsPerRound ?? currentTeamsPerRound;
    setLoading(true);
    setError("");
    setFormatNotice("");
    const result = await setCallupFormat(callup.id, nextPlayers, nextTeams);
    if (!result.success) setError(result.error || "Não foi possível atualizar o formato.");
    else {
      setFormatNotice(result.fantasySizePreserved
        ? `Partida alterada para ${nextPlayers}×${nextPlayers}, com ${nextTeams} times. O Cartola permanece com ${result.fantasyLineupSize} titulares porque já há escalações salvas.`
        : `Formato atualizado: ${nextTeams} times de ${nextPlayers}. O Cartola desta rodada acompanha o novo tamanho.`);
      router.refresh();
    }
    setLoading(false);
  }

  async function buildRound() {
    if (!callup) return;
    if (callup.round_id) {
      router.push(`/admin/rodada?round=${callup.round_id}&mount=1`);
      return;
    }
    setLoading(true);
    setError("");
    const result = await createCallupPrelist(callup.id);
    if (!result.success) {
      setError(result.error || "Não foi possível preparar a pré-lista.");
      setLoading(false);
      return;
    }
    router.push(`/convocacao?callup=${callup.id}`);
  }

  async function copy() {
    if (!callup) return;
    const type = callup.round_type === "friendly" ? "Amistoso" : "Pelada Oficial (Ranked)";
    const dateFormatted = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`));
    const time = callup.start_time ? callup.start_time.slice(0, 5) : "08:00";

    const inviteUrl = buildCallupInviteUrl(window.location.origin, callup.invite_token);
    const text = buildCallupInviteMessage({
      url: inviteUrl,
      heading: "CONVOCAÇÃO ABERTA",
      roundLabel: type,
      date: dateFormatted,
      time,
      stadiumName: callup.stadium_name,
    });
    const result = await shareCallupInvite({
      title: `Convocação aberta · ${type}`,
      text,
    });
    if (result === "cancelled") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section>
      <DelayedPitchLoadingOverlay
        active={loading}
        delayMs={650}
        title="Organizando a rodada"
        description="Preparando a convocação e o campo…"
      />
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Convocação</h2>
        <div className="flex items-center gap-3">
          {callup && !editing && !showCreate && (
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-[10px] font-black uppercase text-muted hover:text-accent">
              <PencilLine className="h-3 w-3" /> Editar
            </button>
          )}
          {!showCreate && (
            <button type="button" onClick={() => { setEditing(false); setContinueOpening(callups.length === 0); setShowCreate(true); }} className="flex items-center gap-1 text-[10px] font-black uppercase text-accent hover:underline">
              <CalendarPlus className="h-3 w-3" /> Nova
            </button>
          )}
        </div>
      </div>
      <div className="glass-card min-w-0 overflow-hidden p-4">
        {error && <div className="mb-3 rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</div>}
        {(showCreate || !callup) && callups.length > 0 && !continueOpening ? (
          <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-black text-warning">Já existe convocação aberta</p>
            <p className="text-xs leading-5 text-muted">Você pode abrir outra convocação, mas precisa escolher um dia diferente. Datas ocupadas: {callups.map((item) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${item.date}T12:00:00`))).join(", ")}.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setContinueOpening(true)} className="rounded-xl bg-accent px-4 py-2.5 text-xs font-black text-background">Continuar com outra data</button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted">Ver convocação atual</button>
            </div>
          </div>
        ) : showCreate || !callup ? (
          <form action={create} className="min-w-0 space-y-3 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <CalendarPlus className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Abrir convocação</p>
                <p className="text-xs text-muted">{newPlayersPerTeam * newTeamsPerRound} vagas e {waitlistCapacity} na fila</p>
              </div>
            </div>

            <fieldset className="rounded-xl border border-accent/25 bg-accent/5 p-3">
              <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-accent">Formato da pelada</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-bold text-muted">Jogadores por time
                  <select name="players_per_team" value={newPlayersPerTeam} onChange={(event) => setNewPlayersPerTeam(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
                    {[5, 6, 7].map((size) => <option key={size} value={size}>{size} × {size}</option>)}
                  </select>
                </label>
                <label className="text-[10px] font-bold text-muted">Quantidade de times
                  <select name="teams_per_round" value={newTeamsPerRound} onChange={(event) => setNewTeamsPerRound(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
                    {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} times</option>)}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted">{newTeamsPerRound} times × {newPlayersPerTeam} jogadores = {newPlayersPerTeam * newTeamsPerRound} vagas. Você pode ajustar antes de montar os times.</p>
            </fieldset>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="w-full min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Data</label>
                <input
                  type="date"
                  name="date"
                  required
                  value={newDate}
                  onChange={(event) => { setNewDate(event.target.value); setError(""); }}
                  className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground [appearance:none]"
                />
                {conflictingCallup && <p role="alert" className="mt-1 text-[11px] font-bold text-warning">Já há uma convocação neste dia. Escolha outra data.</p>}
              </div>

              <div className="w-full min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Horário da pelada</label>
                <input
                  type="time"
                  name="start_time"
                  required
                  defaultValue="08:00"
                  className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground [appearance:none]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Campo / Estádio</label>
              <select
                name="stadium_id"
                value={selectedStadiumId}
                onChange={(event) => {
                  if (event.target.value === "__new__") {
                    setShowQuickStadium(true);
                    return;
                  }
                  setSelectedStadiumId(event.target.value);
                }}
                className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground"
              >
                {availableStadiums.length > 0 ? (
                  availableStadiums.map((stadium) => (
                    <option key={stadium.id} value={stadium.id}>
                      {stadium.name} {stadium.address ? `(${stadium.address})` : ""}
                    </option>
                  ))
                ) : (
                  <option value="">Nenhum campo cadastrado</option>
                )}
                <option value="__new__">＋ Adicionar um novo campo</option>
              </select>
              {!showQuickStadium && (
                <button
                  type="button"
                  onClick={() => setShowQuickStadium(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black text-accent"
                >
                  <Plus className="h-3.5 w-3.5" /> Cadastrar outro campo
                </button>
              )}
              {showQuickStadium && (
                <div className="mt-2 space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3 animate-fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-foreground">Novo campo</p>
                      <p className="text-[10px] text-muted">Cadastre sem sair da criação da rodada.</p>
                    </div>
                    {availableStadiums.length > 0 && (
                      <button type="button" onClick={() => setShowQuickStadium(false)} className="rounded-full p-1 text-muted" aria-label="Fechar cadastro do campo">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <input
                    value={quickStadiumName}
                    onChange={(event) => setQuickStadiumName(event.target.value)}
                    placeholder="Nome do campo"
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground"
                  />
                  <input
                    value={quickStadiumAddress}
                    onChange={(event) => setQuickStadiumAddress(event.target.value)}
                    placeholder="Endereço (opcional)"
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground"
                  />
                  <input
                    type="url"
                    value={quickStadiumMapsUrl}
                    onChange={(event) => setQuickStadiumMapsUrl(event.target.value)}
                    placeholder="Link do Google Maps"
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground"
                  />
                  {quickStadiumError && <p role="alert" className="text-[11px] font-bold text-danger">{quickStadiumError}</p>}
                  <button
                    type="button"
                    onClick={createQuickStadium}
                    disabled={quickStadiumLoading || !quickStadiumName.trim() || !quickStadiumMapsUrl.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs font-black text-background disabled:opacity-50"
                  >
                    {quickStadiumLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {quickStadiumLoading ? "Cadastrando..." : "Cadastrar e selecionar campo"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Tipo de Rodada</label>
              <select
                name="round_type"
                className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground"
              >
                <option value="official">Oficial (Ranked)</option>
                <option value="friendly">Amistoso</option>
              </select>
            </div>

            <button
              disabled={loading || Boolean(conflictingCallup)}
              className="w-full rounded-xl bg-accent py-3 text-sm font-black text-background transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Abrindo convocação..." : "Abrir convocação e começar a convidar"}
            </button>
            {callups.length > 0 && (
              <button type="button" onClick={() => setShowCreate(false)} className="w-full rounded-xl border border-border py-2.5 text-xs font-bold text-muted">
                Cancelar
              </button>
            )}
          </form>
        ) : editing ? (
          <form action={handleEdit} className="min-w-0 space-y-3 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PencilLine className="h-4 w-4 text-accent" />
                <p className="text-xs font-black uppercase text-foreground">Editar Dados da Convocação</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full bg-surface p-1 text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input type="hidden" name="callup_id" value={callup.id} />

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="w-full min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Data</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={callup.date}
                  className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground [appearance:none]"
                />
              </div>

              <div className="w-full min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Horário da pelada</label>
                <input
                  type="time"
                  name="start_time"
                  required
                  defaultValue={callup.start_time?.slice(0, 5) || "08:00"}
                  className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground [appearance:none]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Campo / Estádio</label>
              <select
                name="stadium_id"
                defaultValue={callup.stadium_id || stadiums[0]?.id || ""}
                className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground"
              >
                {stadiums.length > 0 ? (
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

            <div className="space-y-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Tipo de Rodada</label>
              <select
                name="round_type"
                defaultValue={callup.round_type}
                className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground"
              >
                <option value="official">Oficial (Ranked)</option>
                <option value="friendly">Amistoso</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-border py-2.5 text-xs font-bold text-foreground hover:bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-accent py-2.5 text-xs font-black text-background transition-transform active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {formatNotice && <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs font-semibold text-accent">{formatNotice}</p>}
            {callups.length > 1 && (
              <select
                value={callup?.id || ""}
                onChange={(event) => { setSelectedCallupId(event.target.value); setEditing(false); setError(""); setFormatPlayersPerTeam(null); setFormatTeamsPerRound(null); setFormatNotice(""); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground"
                aria-label="Selecionar convocação"
              >
                {callups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.round_type === "friendly" ? "Amistoso" : "Ranked"} · {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${item.date}T12:00:00`))}
                  </option>
                ))}
              </select>
            )}
            <Link href={`/convocacao?callup=${callup?.id}`} className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <CheckCircle2 className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground">
                  {callup.round_type === "friendly" ? "Amistoso" : "Rodada oficial"} · {confirmed}/{capacity}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Clock className="h-3.5 w-3.5 text-accent shrink-0" />
                  <span>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${callup.date}T12:00:00`))} às {callup.start_time?.slice(0, 5) || "08:00"}</span>
                  {callup.stadium_name && <span>· {callup.stadium_name}</span>}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted shrink-0" />
            </Link>

            <div className="rounded-xl border border-border bg-background/60 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">Formato desta convocação</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-bold text-muted">Jogadores por time
                  <select value={formatPlayersPerTeam ?? currentPlayersPerTeam} onChange={(event) => setFormatPlayersPerTeam(Number(event.target.value))} disabled={!canEditFormat || loading} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground disabled:opacity-60">
                    {[5, 6, 7].map((size) => <option key={size} value={size}>{size} × {size}</option>)}
                  </select>
                </label>
                <label className="text-[10px] font-bold text-muted">Times
                  <select value={formatTeamsPerRound ?? currentTeamsPerRound} onChange={(event) => setFormatTeamsPerRound(Number(event.target.value))} disabled={!canEditFormat || loading} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground disabled:opacity-60">
                    {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} times</option>)}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted">{(formatPlayersPerTeam ?? currentPlayersPerTeam) * (formatTeamsPerRound ?? currentTeamsPerRound)} vagas no total. {canEditFormat ? "Se faltarem jogadores, escolha um formato menor antes de montar os times." : "Formato travado após montar os times."}</p>
              {canEditFormat && (formatPlayersPerTeam !== null || formatTeamsPerRound !== null) && (
                <button type="button" onClick={saveFormat} disabled={loading} className="mt-2 w-full rounded-lg bg-accent px-3 py-2 text-xs font-black text-background disabled:opacity-50">{loading ? "Salvando..." : "Aplicar formato"}</button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold text-foreground hover:bg-surface-hover"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Share2 className="h-4 w-4" />}
                {copied ? "Compartilhado!" : "Compartilhar convite"}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-danger/30 py-2.5 text-xs font-bold text-danger hover:bg-danger/10"
              >
                <X className="h-4 w-4" /> Fechar
              </button>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={callup.is_public}
              onClick={toggleVisibility}
              disabled={loading}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-bold disabled:opacity-50 ${callup.is_public ? "border-accent/40 bg-accent/10 text-accent" : "border-warning/35 bg-warning/10 text-warning"}`}
            >
              <span>{callup.is_public ? "Lista aberta para todos" : "Lista privada: ADM e convite"}</span>
              <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${callup.is_public ? "bg-accent" : "bg-warning/50"}`}>
                <span className={`block h-4 w-4 rounded-full bg-background transition-transform ${callup.is_public ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>

            <button
              type="button"
              onClick={buildRound}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-40"
            >
              <Lock className="h-4 w-4" />
              {callup.round_id ? "Montar times" : "Preparar pré-lista"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
