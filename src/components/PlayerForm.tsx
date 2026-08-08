"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlayer, updatePlayer, deletePlayer } from "@/lib/actions/players";
import type { Player } from "@/lib/types";

export function PlayerForm({ player }: { player?: Player }) {
  const router = useRouter();
  const isEditing = !!player;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const nickname = formData.get("nickname") as string;

    if (!name.trim()) {
      setError("O nome é obrigatório");
      setLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const res = await updatePlayer(player.id, { name, nickname });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createPlayer({ name, nickname });
        if (!res.success) throw new Error(res.error);
      }
      
      router.push("/admin/jogadores");
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao salvar o jogador.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir este jogador? Os dados das partidas também serão afetados.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await deletePlayer(player!.id);
      if (!res.success) throw new Error(res.error);
      router.push("/admin/jogadores");
    } catch (err: any) {
      setError(err.message || "Erro ao deletar");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 glass-card p-5">
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="name" className="text-xs font-bold text-muted uppercase tracking-wider">
          Nome Completo
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={player?.name}
          placeholder="Ex: Neymar Júnior"
          className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="nickname" className="text-xs font-bold text-muted uppercase tracking-wider">
          Apelido <span className="text-[10px] text-muted/50 normal-case">(Opcional)</span>
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          defaultValue={player?.nickname || ""}
          placeholder="Ex: Ney"
          className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div className="pt-4 flex flex-col gap-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Jogador"}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="w-full bg-transparent border border-danger/30 hover:bg-danger/10 text-danger font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Excluir Jogador
          </button>
        )}
      </div>
    </form>
  );
}
