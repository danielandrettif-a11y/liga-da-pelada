"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "@/components/icons";
import { getLeagueConfig, updateLeagueConfig, updateLeagueName, updateLeagueVisibility } from "@/lib/actions/league";
import { deleteCurrentLeague } from "@/app/mais/league-mode-actions";

export default function LigaConfigPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [leagueName, setLeagueName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const [nameError, setNameError] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  
  const [leagueId, setLeagueId] = useState("");
  const [matchDuration, setMatchDuration] = useState(7);
  const [playersPerTeam, setPlayersPerTeam] = useState(5);
  const [teamsPerRound, setTeamsPerRound] = useState(3);
  const [stadiumName, setStadiumName] = useState("");
  const [stadiumMapUrl, setStadiumMapUrl] = useState("");
  const [eventDurationMinutes, setEventDurationMinutes] = useState(120);
  const [visibility, setVisibility] = useState<"private" | "open">("private");
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityMessage, setVisibilityMessage] = useState("");

  useEffect(() => {
    async function load() {
      const config = await getLeagueConfig();
      if (config) {
        setLeagueId(config.id);
        setLeagueName(config.name);
        setNameDraft(config.name);
        setCanManage(config.can_manage);
        setMatchDuration(config.match_duration || 7);
        setPlayersPerTeam(config.players_per_team || 5);
        setTeamsPerRound(config.teams_per_round || 3);
        setStadiumName(config.stadium_name || "");
        setStadiumMapUrl(config.stadium_map_url || "");
        setEventDurationMinutes(config.event_duration_minutes || 120);
        setVisibility(config.visibility === "open" ? "open" : "private");
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!loading && canManage && window.location.hash === "#excluir-pelada") {
      document.getElementById("excluir-pelada")?.scrollIntoView({ block: "start" });
    }
  }, [loading, canManage]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess(false);

    const res = await updateLeagueConfig(
      leagueId,
      matchDuration,
      playersPerTeam,
      teamsPerRound,
      stadiumName,
      stadiumMapUrl,
      eventDurationMinutes,
    );
    if (!res.success) {
      setError(res.error || "Erro ao salvar.");
    } else {
      setSuccess(true);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!canManage || deleteConfirmation !== leagueName || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const result = await deleteCurrentLeague(deleteConfirmation);
      if (!result.success) setDeleteError(result.error);
    } catch {
      setDeleteError("Não foi possível excluir a pelada. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleVisibility(nextVisibility: "private" | "open") {
    if (!canManage || savingVisibility) return;
    setSavingVisibility(true);
    setVisibilityMessage("");
    const result = await updateLeagueVisibility(leagueId, nextVisibility);
    if (result.success) {
      setVisibility(nextVisibility);
      setVisibilityMessage(nextVisibility === "open" ? "Pelada aberta para descoberta e entrada." : "Pelada privada: acesso somente por convite ou ADM.");
    } else setVisibilityMessage(result.error || "Não foi possível atualizar a visibilidade.");
    setSavingVisibility(false);
  }

  async function handleNameSave() {
    if (!canManage || savingName) return;
    setSavingName(true);
    setNameMessage("");
    const result = await updateLeagueName(leagueId, nameDraft);
    setNameError(!result.success);
    if (result.success) {
      setLeagueName(result.name);
      setNameDraft(result.name);
      setDeleteConfirmation("");
      setNameMessage("Nome da pelada atualizado.");
      router.refresh();
    } else setNameMessage(result.error);
    setSavingName(false);
  }

  if (loading) return <div className="p-8 text-center text-muted">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/mais?aba=admin"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Configurações da Liga</h1>
          <p className="text-xs text-muted mt-0.5">
            Ajuste as regras gerais do jogo
          </p>
        </div>
      </div>

      {canManage && <section className="glass-card space-y-3 p-5">
        <h2 className="font-athletic text-lg font-black uppercase text-foreground">Nome da pelada</h2>
        <p className="text-xs text-muted">Este nome aparece no cabeçalho, lobby e convites. O link de convite permanece o mesmo.</p>
        <label htmlFor="league-name" className="sr-only">Nome da pelada</label>
        <input id="league-name" type="text" maxLength={80} value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent" />
        <button type="button" onClick={handleNameSave}
          disabled={savingName || nameDraft.trim() === leagueName}
          className="rounded-xl bg-accent px-4 py-3 text-sm font-black text-background disabled:opacity-40">
          {savingName ? "Salvando..." : "Salvar nome"}
        </button>
        {nameMessage && <p role={nameError ? "alert" : "status"} className={`text-xs ${nameError ? "text-danger" : "text-success"}`}>{nameMessage}</p>}
      </section>}

      {canManage && <section className="glass-card space-y-3 p-5">
        <h2 className="font-athletic text-lg font-black uppercase text-foreground">Quem pode encontrar esta pelada?</h2>
        <p className="text-xs leading-5 text-muted">Privada: somente convite ou inclusão pelo ADM. Aberta: aparece na busca e jogadores cadastrados podem entrar.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={savingVisibility} onClick={() => handleVisibility("private")} className={`rounded-xl border px-3 py-3 text-xs font-black ${visibility === "private" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"}`}>Privada</button>
          <button type="button" disabled={savingVisibility} onClick={() => handleVisibility("open")} className={`rounded-xl border px-3 py-3 text-xs font-black ${visibility === "open" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"}`}>Aberta</button>
        </div>
        {visibilityMessage && <p role="status" className="text-xs text-muted">{visibilityMessage}</p>}
      </section>}

      <div className="glass-card p-5 space-y-5 animate-fade-in">
        {error && <div className="p-3 bg-danger/10 text-danger text-xs font-bold rounded-lg">{error}</div>}
        {success && <div className="p-3 bg-success/10 text-success text-xs font-bold rounded-lg">Configurações salvas com sucesso!</div>}

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider">
            Duração da Partida (minutos)
          </label>
          <input
            type="number"
            min="1"
            max="90"
            value={matchDuration}
            onChange={(e) => setMatchDuration(Number(e.target.value))}
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <label className="text-xs font-bold text-muted uppercase tracking-wider">
            Estadio / endereco da pelada
          </label>
          <input
            type="text"
            maxLength={240}
            value={stadiumName}
            onChange={(e) => setStadiumName(e.target.value)}
            placeholder="Ex.: Arena BQ - Rua..."
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider">
            Link do mapa
          </label>
          <input
            type="url"
            maxLength={1000}
            value={stadiumMapUrl}
            onChange={(e) => setStadiumMapUrl(e.target.value)}
            placeholder="https://maps.google.com/..."
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-[10px] leading-relaxed text-muted">Aparece na convocacao e na rodada como “Veja onde fica o estadio”.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider">
            Duracao total da pelada (minutos)
          </label>
          <input
            type="number"
            min="30"
            max="720"
            value={eventDurationMinutes}
            onChange={(e) => setEventDurationMinutes(Number(e.target.value))}
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-[10px] leading-relaxed text-muted">Usada para calcular o termino no Google Agenda e Apple Agenda.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider">
            Jogadores por time
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={playersPerTeam}
            onChange={(e) => setPlayersPerTeam(Number(e.target.value))}
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-[10px] leading-relaxed text-muted">
            O padrão é 5. Você pode escolher entre 1 e 10 jogadores em cada time.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wider">
            Quantidade de times
          </label>
          <input
            type="number"
            min="2"
            max="6"
            value={teamsPerRound}
            onChange={(e) => setTeamsPerRound(Number(e.target.value))}
            className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-[10px] leading-relaxed text-muted">
            O padrão é 3. A convocação abrirá com {playersPerTeam * teamsPerRound} vagas.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </button>
      </div>

      {canManage && <section id="excluir-pelada" className="scroll-mt-24 rounded-2xl border border-danger/40 bg-danger/5 p-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-danger">Excluir esta pelada</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Exclui permanentemente {leagueName}, suas rodadas, partidas, ranking, convocações e dados do Cartola.
          Contas e perfis de jogadores usados em outras peladas permanecem. Esta ação não pode ser desfeita.
          A última pelada ativa só poderá ser excluída quando a criação de novas peladas estiver disponível.
        </p>
        {!showDelete ? <button type="button" onClick={() => setShowDelete(true)}
          className="mt-4 rounded-xl border border-danger/50 px-4 py-3 text-sm font-bold text-danger">
          Quero excluir esta pelada
        </button> : <div className="mt-4 space-y-3">
          <label htmlFor="delete-league-name" className="block text-xs font-bold text-foreground">
            Digite exatamente <span className="text-danger">{leagueName}</span> para confirmar
          </label>
          <input id="delete-league-name" value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off"
            className="w-full rounded-xl border border-danger/50 bg-background px-4 py-3 text-sm text-foreground" />
          {deleteError && <p role="alert" className="text-xs text-danger">{deleteError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleDelete}
              disabled={deleting || deleteConfirmation !== leagueName}
              className="rounded-xl bg-danger px-4 py-3 text-sm font-black text-white disabled:opacity-40">
              {deleting ? "Excluindo..." : "Excluir permanentemente"}
            </button>
            <button type="button" onClick={() => { setShowDelete(false); setDeleteConfirmation(""); setDeleteError(""); }}
              disabled={deleting} className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-muted">
              Cancelar
            </button>
          </div>
        </div>}
      </section>}
    </div>
  );
}
