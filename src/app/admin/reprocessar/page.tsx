"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import {
  previewReprocessSeason,
  executeReprocessSeason,
  type ReprocessPreviewResult,
  type ReprocessExecutionResult,
} from "@/lib/actions/reprocess";

export default function ReprocessarPage() {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<ReprocessPreviewResult | null>(null);
  const [result, setResult] = useState<ReprocessExecutionResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handlePreview() {
    setLoading(true);
    setResult(null);
    try {
      const data = await previewReprocessSeason();
      setPreview(data);
    } catch (err: any) {
      alert("Erro ao carregar prévia: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    setExecuting(true);
    try {
      const data = await executeReprocessSeason();
      setResult(data);
      setConfirmOpen(false);
      // Recarregar prévia pós-execução
      await handlePreview();
    } catch (err: any) {
      alert("Erro ao executar reprocessamento: " + err.message);
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface transition-colors hover:bg-surface-hover"
          aria-label="Voltar para o Admin"
        >
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Reprocessar Temporada (BQ v5)</h1>
          <p className="mt-0.5 text-xs text-muted">
            Recalcular todas as pontuações, posições e patrimônios da temporada ativa
          </p>
        </div>
      </div>

      {/* Card Explicativo */}
      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center gap-2 text-warning font-semibold text-sm">
          <span>⚠️</span>
          <span>Ação Crítica de Temporada</span>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Esta ferramenta aplica as regras do <strong>BQ v5</strong> (scouts básicos unificados,
          bônus posicionais DEF/MEI/ATA e novo modelo de mercado) retroativamente em todas as rodadas
          da temporada ativa. Escalações, capitães e palpites são preservados.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading || executing}
            className="rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-background transition-transform active:scale-95 disabled:opacity-50"
          >
            {loading ? "Carregando prévia..." : "Pré-visualizar impacto"}
          </button>
        </div>
      </div>

      {/* Resultado da Execução */}
      {result && (
        <div
          className={`glass-card p-4 text-xs font-semibold ${
            result.success ? "border border-emerald-500/30 text-emerald-400" : "border border-rose-500/30 text-rose-400"
          }`}
        >
          {result.success ? (
            <div>
              ✅ <strong>Temporada reprocessada com sucesso!</strong>
              <p className="mt-1 font-normal text-muted">
                {result.rounds_reprocessed} rodadas e {result.lineups_reprocessed} escalações recalculadas.
              </p>
            </div>
          ) : (
            <div>❌ Erro ao reprocessar: {result.error}</div>
          )}
        </div>
      )}

      {/* Prévia */}
      {preview && (
        <div className="space-y-4">
          {!preview.can_reprocess ? (
            <div className="glass-card border border-rose-500/40 p-4 text-xs text-rose-400">
              ⛔ <strong>Reprocessamento Bloqueado:</strong> {preview.reason}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="glass-card p-4">
                  <p className="text-[11px] text-muted">Rodadas Finalizadas</p>
                  <p className="mt-1 text-2xl font-black text-foreground">{preview.rounds_count}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-[11px] text-muted">Escalações Avaliadas</p>
                  <p className="mt-1 text-2xl font-black text-foreground">{preview.lineups_count}</p>
                </div>
                <div className="glass-card col-span-2 sm:col-span-1 p-4">
                  <p className="text-[11px] text-muted">Status</p>
                  <p className="mt-1 text-sm font-bold text-emerald-400">Pronto para Reprocessar</p>
                </div>
              </div>

              {/* Lista de Rodadas */}
              {preview.rounds && preview.rounds.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <div className="border-b border-border p-3 text-xs font-bold text-foreground">
                    Rodadas que serão recalculadas
                  </div>
                  <div className="divide-y divide-border text-xs">
                    {preview.rounds.map((r) => (
                      <div key={r.round_id} className="flex items-center justify-between p-3">
                        <div>
                          <span className="font-semibold text-foreground">Rodada #{r.number}</span>
                          <span className="ml-2 text-muted">{new Date(r.date).toLocaleDateString("pt-BR")}</span>
                        </div>
                        <div className="text-muted">{r.lineups_count} escalações</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ação de Executar */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={executing}
                  className="w-full rounded-xl bg-rose-600 px-4 py-3 text-xs font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
                >
                  {executing ? "Reprocessando temporada..." : "Confirmar e Reprocessar Temporada"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de Confirmação Dupla */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="glass-card max-w-md space-y-4 p-6 shadow-2xl">
            <h2 className="text-base font-bold text-rose-500">Tem certeza absoluta?</h2>
            <p className="text-xs leading-relaxed text-muted">
              Esta ação recalculará cronologicamente todas as rodadas da temporada ativa usando as
              regras BQ v5. Os patrimônios e rankings de todos os jogadores serão atualizados.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={executing}
                className="flex-1 rounded-xl bg-surface px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={executing}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white transition-opacity disabled:opacity-50"
              >
                {executing ? "Executando..." : "Sim, Reprocessar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
