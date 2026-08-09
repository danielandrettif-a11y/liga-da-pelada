"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Lock, UserRoundPlus } from "lucide-react";
import { PLAYER_PROFILE_OPTIONS } from "@/lib/playerProfiles";
import { signup } from "./actions";

export default function CadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    const result = await signup(formData);

    if (!result.success) {
      setError(result.error || "Não foi possível criar a conta.");
      setLoading(false);
      return;
    }

    if (result.requiresConfirmation) {
      setConfirmationSent(true);
      setLoading(false);
      return;
    }

    router.push("/meu-perfil");
    router.refresh();
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
          <h1 className="mt-4 text-xl font-black text-foreground">Confira seu e-mail</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Enviamos o link de confirmação. Depois de confirmar, entre na conta para adicionar sua foto.
          </p>
          <Link href="/login" className="btn-primary mt-6 block w-full py-3.5">Ir para o login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-5 py-4">
      <div className="flex items-center gap-3">
        <Link href="/login" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-foreground">Criar minha conta</h1>
          <p className="text-xs text-muted">Seu perfil de jogador será criado automaticamente</p>
        </div>
      </div>

      <form action={handleSubmit} className="glass-card space-y-4 p-5">
        {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Nome completo</label>
          <div className="relative">
            <UserRoundPlus className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input name="name" required maxLength={120} placeholder="Seu nome" className="w-full rounded-xl border border-border bg-surface-hover py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Apelido <span className="normal-case text-muted/50">(opcional)</span></label>
          <input name="nickname" maxLength={60} placeholder="Como aparece no app" className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground outline-none focus:border-accent" />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wider text-muted">Estilo de jogo</legend>
          <div className="grid grid-cols-3 gap-2">
            {PLAYER_PROFILE_OPTIONS.map((option) => (
              <label key={option.value} className="cursor-pointer rounded-xl border border-border bg-surface-hover p-3 text-center has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <input type="radio" name="player_profile" value={option.value} defaultChecked={option.value === "midfield"} className="sr-only" />
                <span className="block text-xs font-black text-foreground">{option.label}</span>
                <span className="mt-1 block text-[9px] text-muted">{option.shortLabel}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">E-mail</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input type="email" name="email" required autoComplete="email" placeholder="voce@email.com" className="w-full rounded-xl border border-border bg-surface-hover py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" className="w-full rounded-xl border border-border bg-surface-hover py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Confirmar senha</label>
          <input type="password" name="password_confirmation" required minLength={8} autoComplete="new-password" placeholder="Digite a senha novamente" className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground outline-none focus:border-accent" />
        </div>

        <p className="rounded-xl bg-accent/5 p-3 text-[10px] leading-4 text-muted">
          Depois de entrar, você poderá adicionar e enquadrar sua foto em Meu Perfil.
        </p>

        <button type="submit" disabled={loading} className="btn-primary flex h-12 w-full items-center justify-center py-3.5 disabled:opacity-50">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar conta de jogador"}
        </button>
      </form>
    </div>
  );
}
