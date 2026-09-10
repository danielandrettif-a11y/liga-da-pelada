"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Trophy } from "@/components/icons";
import { updatePassword } from "@/app/login/actions";

export default function RedefinirSenhaPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await updatePassword(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-light shadow-lg shadow-accent/20">
            <Trophy className="h-8 w-8 text-black" />
          </div>
          <h1 className="text-center text-2xl font-bold text-foreground">Criar nova senha</h1>
          <p className="mt-1 text-center text-sm text-muted">Use pelo menos 8 caracteres.</p>
        </div>

        <div className="glass-card p-6">
          <form action={handleSubmit} className="space-y-4">
            {error && <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm font-medium text-danger">{error}</div>}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Nova senha</span>
              <span className="relative block">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input type="password" name="password" required minLength={8} autoComplete="new-password" className="w-full rounded-xl border border-border bg-surface-hover py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent" />
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Confirmar nova senha</span>
              <input type="password" name="password_confirmation" required minLength={8} autoComplete="new-password" className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground outline-none focus:border-accent" />
            </label>
            <button type="submit" disabled={loading} className="btn-primary flex h-12 w-full items-center justify-center py-3.5">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Alterar senha"}
            </button>
          </form>
          <Link href="/login" className="mt-4 block text-center text-xs font-bold text-muted hover:text-accent">Voltar para o login</Link>
        </div>
      </div>
    </div>
  );
}
