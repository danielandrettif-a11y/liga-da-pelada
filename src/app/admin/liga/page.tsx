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

  useEffect(() => {
    async function load() {
      const config = await getLeagueConfig();
      if (config) {
        setLeagueId(config.id);
        setMatchDuration(config.match_duration || 7);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess(false);

    const res = await updateLeagueConfig(leagueId, matchDuration);
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
