"use client";

import { useState } from "react";
import { login } from "./actions";
import { Lock, Mail, Trophy, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-[80vh] items-center justify-center animate-fade-in px-4">
      <div className="w-full max-w-sm">
        
        {/* Logo and Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center shadow-lg shadow-accent/20 mb-4">
            <Trophy className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">Pelada de Baixa Qualidade</h1>
          <p className="text-muted text-sm mt-1">Entre para acessar sua conta</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-6">
          <form action={handleSubmit} className="space-y-4">
            
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                <span className="text-red-500 text-sm font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="admin@peladabaixa.com"
                  className="w-full bg-surface-hover border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-surface-hover border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-6 py-3.5 flex justify-center items-center h-12"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase text-muted">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Link href="/cadastro" className="block w-full rounded-xl border border-accent/40 py-3.5 text-center text-sm font-bold text-accent hover:bg-accent/10">
            Criar minha conta
          </Link>
        </div>
        
        <p className="text-center text-xs text-muted mt-8">
          Jogadores podem criar a própria conta. Administradores são cadastrados manualmente.
        </p>

      </div>
    </div>
  );
}
