"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, MailCheck, Lock, UserRoundPlus } from "@/components/icons";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { PLAYER_PROFILE_OPTIONS } from "@/lib/playerProfiles";
import { signup } from "./actions";

function CadastroContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") || "";
  const returnTo = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

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
      setConfirmationEmail(result.email || "");
      setConfirmationSent(true);
      setLoading(false);
      return;
    }

    router.push(returnTo || "/meu-perfil");
    router.refresh();
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
          <h1 className="mt-4 text-xl font-black text-foreground">Falta confirmar seu cadastro</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Enviamos um link de confirmação para{confirmationEmail ? (
              <> <strong className="text-foreground">{confirmationEmail}</strong></>
            ) : " o seu e-mail"}.
          </p>
          <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-left">
            <p className="text-sm font-black text-warning">Sua conta ainda não está liberada.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted">
              <li>Abra a sua caixa de entrada ou spam.</li>
              <li>Clique no link de confirmação enviado pelo app.</li>
              <li>Depois da confirmação, você poderá entrar normalmente.</li>
            </ol>
          </div>
          <Link href={`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`} className="btn-primary mt-6 block w-full py-3.5">Já confirmei — ir para o login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-5 py-4">
      <div className="flex items-center gap-3">
        <Link href={`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-foreground">Criar minha conta</h1>
          <p className="text-xs text-muted">Seu perfil de jogador será criado automaticamente</p>
        </div>
      </div>

      <div className="glass-card p-5">
        <GoogleAuthButton label="Criar conta com Google" returnTo={returnTo} />
        <p className="mt-2 text-center text-[10px] leading-4 text-muted">
          A conta do Google já possui e-mail confirmado e cria seu perfil de jogador automaticamente.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-bold uppercase text-muted">ou cadastre-se com e-mail</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form action={handleSubmit} className="glass-card space-y-4 p-5">
        <input type="hidden" name="next" value={returnTo} />
        {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}

        <div role="note" className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-xs font-black text-warning">Confirmação de e-mail obrigatória</p>
            <p className="mt-1 text-[10px] leading-4 text-muted">
              Depois de criar a conta, abra o e-mail enviado pelo app e confirme o cadastro. Sem essa confirmação, o login não será liberado.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Nome completo</label>
          <div className="relative">
            <UserRoundPlus className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input name="name" required maxLength={120} placeholder="Seu nome" className="w-full rounded-xl border border-border bg-surface-hover py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Apelido <span className="normal-case text-muted/50">(opcional)</span></label>
          <input name="nickname" maxLength={60} placeholder="Ex: Pontinha insinuante" className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground outline-none focus:border-accent" />
          <p className="mt-1 text-[10px] text-muted">O apelido aparece como subnome no perfil e na carta.</p>
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
          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
            <input type="checkbox" name="is_goalkeeper" value="true" className="h-4 w-4 accent-[var(--accent)]" />
            <span className="text-left">
              <span className="block text-xs font-black text-foreground">TambÃ©m jogo no gol</span>
              <span className="mt-0.5 block text-[9px] leading-3 text-muted">GOL aparece junto da sua Ãºnica posiÃ§Ã£o de linha.</span>
            </span>
          </label>
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

export default function CadastroPage() {
  return <Suspense fallback={<div className="min-h-[75vh]" />}><CadastroContent /></Suspense>;
}
