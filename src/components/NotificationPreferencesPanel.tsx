"use client";

import { useState } from "react";
import { Bell, Loader2, Mail } from "@/components/icons";
import {
  sendCartolaEmailTest,
  setCartolaRemindersEnabled,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/app/mais/notification-actions";

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-accent" : "bg-surface-hover"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button>;
}

export function NotificationPreferencesPanel({ initial, isAdmin }: { initial: NotificationPreferences; isAdmin: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function change(key: "matchPushEnabled" | "cartolaPushEnabled" | "cartolaEmailEnabled", value: boolean) {
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setBusy(key);
    setMessage("");
    const result = await updateNotificationPreferences({ matchPushEnabled: next.matchPushEnabled, cartolaPushEnabled: next.cartolaPushEnabled, cartolaEmailEnabled: next.cartolaEmailEnabled });
    if (!result.success) {
      setSettings(previous);
      setMessage(result.error || "Não foi possível salvar.");
    }
    setBusy(null);
  }

  async function testEmail() {
    setBusy("test"); setMessage("");
    const result = await sendCartolaEmailTest();
    if (result.success) {
      setSettings((current) => ({ ...current, emailTestedAt: result.testedAt || new Date().toISOString() }));
      setMessage("Teste enviado para o e-mail desta conta ADM.");
    } else setMessage(result.error || "Não foi possível enviar o teste.");
    setBusy(null);
  }

  async function toggleCollective(value: boolean) {
    setBusy("collective"); setMessage("");
    const result = await setCartolaRemindersEnabled(value);
    if (result.success) {
      setSettings((current) => ({ ...current, collectiveEnabled: value }));
      setMessage(value ? "Lembretes automáticos ativados." : "Lembretes automáticos pausados.");
    } else setMessage(result.error || "Não foi possível alterar o envio geral.");
    setBusy(null);
  }

  return <div className="space-y-5">
    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border p-4"><Bell className="h-5 w-5 text-accent" /><div><h2 className="text-sm font-black text-foreground">Alertas no celular</h2><p className="text-xs text-muted">Escolha quais avisos podem usar o push deste aparelho.</p></div></div>
      <div className="divide-y divide-border">
        <div className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">Partidas e cronômetro</p><p className="text-xs leading-5 text-muted">1 minuto, 30 segundos, fim de jogo e resultados.</p></div><Toggle label="Alertas de partida" checked={settings.matchPushEnabled} disabled={busy !== null} onChange={(value) => void change("matchPushEnabled", value)} /></div>
        <div className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">Lembretes do Cartola</p><p className="text-xs leading-5 text-muted">Abertura do mercado, 1 dia, 12 horas e 1 hora antes.</p></div><Toggle label="Push do Cartola" checked={settings.cartolaPushEnabled} disabled={busy !== null} onChange={(value) => void change("cartolaPushEnabled", value)} /></div>
      </div>
    </section>

    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border p-4"><Mail className="h-5 w-5 text-accent" /><div className="min-w-0 flex-1"><h2 className="text-sm font-black text-foreground">Lembretes por e-mail</h2><p className="text-xs text-muted">Só chegam enquanto sua escalação estiver incompleta.</p></div><Toggle label="E-mails do Cartola" checked={settings.cartolaEmailEnabled} disabled={busy !== null} onChange={(value) => void change("cartolaEmailEnabled", value)} /></div>
      <p className="px-4 py-3 text-[11px] leading-5 text-muted">Você também pode cancelar pelo link presente em cada e-mail e reativar por esta tela.</p>
    </section>

    {isAdmin && <section className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-warning">Controle do ADM</p>
      <h2 className="mt-1 text-base font-black text-foreground">Envio automático da liga</h2>
      <p className="mt-1 text-xs leading-5 text-muted">Teste primeiro no seu e-mail. Só depois o envio para os jogadores poderá ser ativado.</p>
      {!settings.emailConfigured && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-xs font-semibold text-danger">Configure RESEND_API_KEY, RESEND_FROM_EMAIL e EMAIL_UNSUBSCRIBE_SECRET no servidor.</p>}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => void testEmail()} disabled={busy !== null || !settings.emailConfigured} className="rounded-xl border border-warning/35 px-4 py-3 text-xs font-black text-warning disabled:opacity-50">{busy === "test" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : settings.emailTestedAt ? "Testar novamente" : "Enviar teste para mim"}</button><button type="button" onClick={() => void toggleCollective(!settings.collectiveEnabled)} disabled={busy !== null || !settings.emailTestedAt} className={`rounded-xl px-4 py-3 text-xs font-black disabled:opacity-50 ${settings.collectiveEnabled ? "border border-border text-muted" : "bg-accent text-background"}`}>{busy === "collective" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : settings.collectiveEnabled ? "Pausar envios gerais" : "Ativar envios gerais"}</button></div>
      <p className="mt-3 text-[11px] text-muted">Status: {settings.collectiveEnabled ? "envios gerais ativos" : settings.emailTestedAt ? "teste concluído; aguardando ativação" : "aguardando teste"}.</p>
    </section>}
    {message && <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted" role="status">{message}</p>}
  </div>;
}
