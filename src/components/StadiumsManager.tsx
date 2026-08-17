"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  MapPin,
  PencilLine,
  Plus,
  Save,
  Stadium as StadiumIcon,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
} from "@/components/icons";
import { deleteStadium, reorderStadiums, saveStadium } from "@/lib/actions/stadiums";
import type { Stadium } from "@/lib/types";

export function StadiumsManager({ initialStadiums }: { initialStadiums: Stadium[] }) {
  const router = useRouter();
  const [stadiums, setStadiums] = useState<Stadium[]>(initialStadiums);
  const [editingStadium, setEditingStadium] = useState<Stadium | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");

  function openCreate() {
    setEditingStadium(null);
    setName("");
    setAddress("");
    setGoogleMapsUrl("");
    setIsCreating(true);
    setError("");
    setSuccess("");
  }

  function openEdit(stadium: Stadium) {
    setIsCreating(false);
    setEditingStadium(stadium);
    setName(stadium.name);
    setAddress(stadium.address || "");
    setGoogleMapsUrl(stadium.google_maps_url);
    setError("");
    setSuccess("");
  }

  function closeForm() {
    setIsCreating(false);
    setEditingStadium(null);
    setName("");
    setAddress("");
    setGoogleMapsUrl("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    if (editingStadium) {
      formData.set("id", editingStadium.id);
    }
    formData.set("name", name);
    formData.set("address", address);
    formData.set("google_maps_url", googleMapsUrl);

    const result = await saveStadium(formData);
    if (!result.success) {
      setError(result.error || "Erro ao salvar campo/estádio.");
    } else {
      setSuccess(editingStadium ? "Estádio atualizado com sucesso!" : "Estádio cadastrado com sucesso!");
      closeForm();
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDelete(stadium: Stadium) {
    if (!confirm(`Tem certeza que deseja excluir o estádio "${stadium.name}"?`)) return;
    setLoading(true);
    setError("");
    const result = await deleteStadium(stadium.id);
    if (!result.success) {
      setError(result.error || "Erro ao excluir estádio.");
    } else {
      setStadiums((prev) => prev.filter((s) => s.id !== stadium.id));
      setSuccess("Estádio excluído.");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stadiums.length) return;

    const newStadiums = [...stadiums];
    const [moved] = newStadiums.splice(index, 1);
    newStadiums.splice(targetIndex, 0, moved);

    setStadiums(newStadiums);
    setLoading(true);
    const result = await reorderStadiums(newStadiums.map((s) => s.id));
    if (!result.success) {
      setError(result.error || "Erro ao reordenar.");
      setStadiums(initialStadiums);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/mais"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover transition-colors"
            aria-label="Voltar para Mais"
          >
            <ArrowLeft className="h-5 w-5 text-muted" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Campos e Estádios</h1>
            <p className="text-xs text-muted mt-0.5">Cadastre os locais e defina a ordem de seleção</p>
          </div>
        </div>
        {!isCreating && !editingStadium && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-xs font-black text-background transition-transform active:scale-95 shadow-[0_0_20px_rgba(204,255,0,.15)]"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-xs font-bold text-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 p-3 text-xs font-bold text-success">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </div>
      )}

      {/* Formulário de Adicionar / Editar */}
      {(isCreating || editingStadium) && (
        <section className="glass-card p-5 space-y-4 animate-fade-in border border-accent/30">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <StadiumIcon className="h-5 w-5 text-accent" />
              <h2 className="text-sm font-black text-foreground">
                {editingStadium ? `Editar: ${editingStadium.name}` : "Novo Campo / Estádio"}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">
                Nome do Campo / Estádio *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Arena Gol de Ouro"
                className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">
                Endereço / Ponto de Referência
              </label>
              <input
                type="text"
                maxLength={240}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex.: Av. Principal, 1500 - Bairro Centro"
                className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">
                Link do Google Maps *
              </label>
              <input
                type="url"
                required
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/... ou https://maps.google.com/..."
                className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
              />
              <p className="text-[10px] text-muted leading-relaxed">
                Cole o link de compartilhamento do Google Maps. Os jogadores poderão clicar para abrir a rota no GPS.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={loading}
                className="flex-1 rounded-xl border border-border py-3 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-xs font-black text-background transition-colors hover:bg-accent-light disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingStadium ? "Salvar Alterações" : "Cadastrar Campo"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Lista de Estádios Ordenados */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
            Ordem de Exibição ({stadiums.length})
          </h2>
          <span className="text-[10px] text-muted">Use as setas para definir a prioridade</span>
        </div>

        {stadiums.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center p-8 text-center">
            <StadiumIcon className="h-10 w-10 text-muted/40 mb-3" />
            <p className="text-sm font-bold text-foreground">Nenhum estádio cadastrado</p>
            <p className="text-xs text-muted mt-1 max-w-xs">
              Cadastre o primeiro campo de futebol para que ele apareça na criação das convocações e rodadas.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-black text-background"
            >
              <Plus className="h-4 w-4" /> Cadastrar agora
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {stadiums.map((stadium, index) => (
              <div
                key={stadium.id}
                className="glass-card flex items-center gap-3 p-3.5 transition-colors hover:border-accent/30"
              >
                {/* Reordenação */}
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMove(index, "up")}
                    disabled={index === 0 || loading}
                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-20"
                    aria-label="Subir posição"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, "down")}
                    disabled={index === stadiums.length - 1 || loading}
                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-20"
                    aria-label="Descer posição"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Ícone e Posição */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-xs font-black text-accent">
                  {index + 1}
                </span>

                {/* Dados do Estádio */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-black text-foreground">{stadium.name}</p>
                    {stadium.google_maps_url && (
                      <a
                        href={stadium.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:text-accent-light shrink-0"
                        title="Abrir no Google Maps"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {stadium.address && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-muted mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{stadium.address}</span>
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(stadium)}
                    disabled={loading}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
                    aria-label={`Editar ${stadium.name}`}
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(stadium)}
                    disabled={loading}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                    aria-label={`Excluir ${stadium.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
