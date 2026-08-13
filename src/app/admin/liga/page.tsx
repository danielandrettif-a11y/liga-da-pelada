"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "@/components/icons";
import { getLeagueConfig, updateLeagueConfig } from "@/lib/actions/league";

export default function LigaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
  const [leagueId, setLeagueId] = useState("");
  const [matchDuration, setMatchDuration] = useState(7);
  const [playersPerTeam, setPlayersPerTeam] = useState(5);
  const [teamsPerRound, setTeamsPerRound] = useState(3);
  const [stadiumName, setStadiumName] = useState("");
  const [stadiumMapUrl, setStadiumMapUrl] = useState("");
  const [eventDurationMinutes, setEventDurationMinutes] = useState(120);

  useEffect(() => {
    async function load() {
      const config = await getLeagueConfig();
      if (config) {
        setLeagueId(config.id);
        setMatchDuration(config.match_duration || 7);
        setPlayersPerTeam(config.players_per_team || 5);
        setTeamsPerRound(config.teams_per_round || 3);
        setStadiumName(config.stadium_name || "");
        setStadiumMapUrl(config.stadium_map_url || "");
        setEventDurationMinutes(config.event_duration_minutes || 120);
      }
      setLoading(false);
    }
    load();
  }, []);

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

  if (loading) return <div className="p-8 text-center text-muted">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/mais"
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
    </div>
  );
}
