"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Loader2 } from "@/components/icons";
import {
  getPushPublicKey,
  getPushSystemStatus,
  sendPushTest,
  subscribeToPush,
  unsubscribeFromPush,
  type SerializedPushSubscription,
} from "@/app/mais/notification-actions";

type NotificationState = "loading" | "unsupported" | "needs-install" | "denied" | "inactive" | "active";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isIOS() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as NavigatorWithStandalone).standalone === true;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function serializeSubscription(subscription: PushSubscription): SerializedPushSubscription | null {
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) return null;

  return {
    endpoint: serialized.endpoint,
    expirationTime: serialized.expirationTime ?? null,
    keys: {
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
    },
    userAgent: navigator.userAgent,
  };
}

async function registerPushWorker() {
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  return navigator.serviceWorker.ready;
}

export function PushNotificationSettings() {
  const [state, setState] = useState<NotificationState>("loading");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [backgroundAlertsReady, setBackgroundAlertsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function inspectSubscription() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if (isIOS() && !isStandalone()) {
        if (!cancelled) setState("needs-install");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const systemStatus = await getPushSystemStatus();
        if (!cancelled) setBackgroundAlertsReady(systemStatus.backgroundAlertsConfigured);
        const registration = await registerPushWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (subscription) {
          setState("active");
          const serialized = serializeSubscription(subscription);
          if (serialized) {
            const result = await subscribeToPush(serialized);
            if (!result.success && !cancelled) {
              setState("inactive");
              setMessage(result.error || "Não foi possível confirmar as notificações.");
            }
          }
        } else {
          setState("inactive");
        }
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }

    void inspectSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enableNotifications() {
    setIsBusy(true);
    setMessage("");

    try {
      const configuration = await getPushPublicKey();
      const publicKey = configuration.publicKey;
      if (!configuration.success) throw new Error(configuration.error);
      if (!publicKey) throw new Error("As notificações ainda não foram configuradas no servidor.");
      setBackgroundAlertsReady(configuration.backgroundAlertsConfigured);

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "inactive");
        setMessage("A permissão não foi concedida.");
        return;
      }

      const registration = await registerPushWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const serialized = serializeSubscription(subscription);
      if (!serialized) throw new Error("O celular retornou uma assinatura inválida.");

      const result = await subscribeToPush(serialized);
      if (!result.success) {
        await subscription.unsubscribe();
        throw new Error(result.error);
      }

      setState("active");
      setMessage("Você receberá o alerta de 30 segundos e o fim das partidas da rodada em que estiver inscrito.");
    } catch (error) {
      setState("inactive");
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar as notificações.");
    } finally {
      setIsBusy(false);
    }
  }

  async function disableNotifications() {
    setIsBusy(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const result = await unsubscribeFromPush(subscription.endpoint);
        if (!result.success) throw new Error(result.error);
        await subscription.unsubscribe();
      }
      setState("inactive");
      setMessage("Notificações desativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desativar as notificações.");
    } finally {
      setIsBusy(false);
    }
  }

  async function testNotifications() {
    setIsBusy(true);
    setMessage("");
    const result = await sendPushTest();
    setMessage(result.success
      ? "Teste agendado para 10 segundos. Bloqueie a tela agora."
      : result.error || "Não foi possível enviar o teste.");
    setIsBusy(false);
  }

  if (state === "unsupported") return null;

  const isActive = state === "active";
  const description = state === "needs-install"
    ? "Abra o site pelo ícone instalado na tela inicial para ativar."
    : state === "denied"
      ? "Permissão bloqueada. Libere nas configurações do celular."
      : isActive
        ? backgroundAlertsReady
          ? "Alertas de 30 segundos, fim de jogo e resultados das rodadas em que você estiver inscrito."
          : "Notificações ativadas neste aparelho. O agendador de tela bloqueada ainda precisa ser configurado pelo administrador."
        : "Receba os avisos de 30 segundos e fim das partidas da sua rodada.";

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Notificações</h2>
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-accent text-background" : "bg-accent/10 text-accent"}`}>
            {isActive ? <Check className="h-5 w-5" strokeWidth={2.4} /> : <Bell className="h-5 w-5" />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {isActive ? "Notificações ativadas" : "Avisos de partida"}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
          </span>

          {(state === "active" || state === "inactive") && (
            <div className="flex shrink-0 flex-col gap-1.5">
              {isActive && (
                <button
                  type="button"
                  onClick={testNotifications}
                  disabled={isBusy}
                  className="rounded-lg bg-surface px-3 py-2 text-xs font-black text-accent transition-colors hover:bg-surface-hover disabled:opacity-60"
                >
                  Testar
                </button>
              )}
              <button
                type="button"
                onClick={isActive ? disableNotifications : enableNotifications}
                disabled={isBusy}
                className={`rounded-lg px-3 py-2 text-xs font-black transition-colors disabled:opacity-60 ${isActive ? "border border-border text-muted hover:text-foreground" : "bg-accent text-background hover:bg-accent-light"}`}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : isActive ? "Desativar" : "Ativar"}
              </button>
            </div>
          )}
        </div>

        {message && (
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
