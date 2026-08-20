"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Download,
  MoreHorizontal,
  Share2,
  X,
} from "@/components/icons";

type InstallPlatform = "android" | "ios-safari" | "ios-other" | "unsupported";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type InstallPreference = {
  visitCount: number;
  snoozeUntil?: number;
  disableAutomaticPrompt?: boolean;
  installedAt?: number;
};

type NavigatorWithPwa = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ id?: string; platform?: string; url?: string }>>;
};

export const OPEN_INSTALL_PROMPT_EVENT = "pbq:open-install-prompt";

const STORAGE_VERSION = "v1";
const SNOOZE_DURATION = 7 * 24 * 60 * 60 * 1000;

function preferenceKey(userId: string) {
  return `pbq:pwa-prompt:${STORAGE_VERSION}:${userId}`;
}

function sessionKey(userId: string) {
  return `pbq:pwa-session:${STORAGE_VERSION}:${userId}`;
}

function readPreference(userId: string): InstallPreference {
  try {
    const stored = window.localStorage.getItem(preferenceKey(userId));
    if (!stored) return { visitCount: 0 };
    return { visitCount: 0, ...JSON.parse(stored) } as InstallPreference;
  } catch {
    return { visitCount: 0 };
  }
}

function writePreference(userId: string, preference: InstallPreference) {
  try {
    window.localStorage.setItem(preferenceKey(userId), JSON.stringify(preference));
  } catch {
    // O convite continua funcionando durante a sessão mesmo sem armazenamento local.
  }
}

function detectPlatform(): InstallPlatform {
  const navigatorWithPwa = navigator as NavigatorWithPwa;
  const userAgent = navigator.userAgent;
  const isIPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || isIPad;

  if (isIOS) {
    const isAlternativeBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    return isAlternativeBrowser ? "ios-other" : "ios-safari";
  }

  if (/Android/i.test(userAgent)) return "android";
  if (navigatorWithPwa.standalone) return "ios-safari";
  return "unsupported";
}

function isStandaloneMode() {
  const navigatorWithPwa = navigator as NavigatorWithPwa;
  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithPwa.standalone === true;
}

function InstallStep({
  number,
  icon,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.035] p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 font-athletic text-sm font-black text-accent">
        {number}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
        {icon}
      </span>
      <span className="text-sm font-semibold leading-snug text-foreground">{children}</span>
    </li>
  );
}

export function InstallAppPrompt({
  userId,
  isProfileReady,
}: {
  userId: string;
  isProfileReady: boolean;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const countedSessionRef = useRef(false);
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
  const [activeTab, setActiveTab] = useState<"ios" | "android">("ios");
  const [isReady, setIsReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openedManually, setOpenedManually] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const currentPlatform = detectPlatform();
    const standalone = isStandaloneMode();
    setPlatform(currentPlatform);
    setActiveTab(currentPlatform === "android" ? "android" : "ios");
    setIsInstalled(standalone);
    setIsReady(true);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      setIsInstalled(false);
    };

    const markInstalled = () => {
      const preference = readPreference(userId);
      writePreference(userId, { ...preference, installedAt: Date.now() });
      setIsInstalled(true);
      setIsOpen(false);
    };

    const handleManualOpen = () => {
      setOpenedManually(true);
      setIsOpen(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", markInstalled);
    window.addEventListener(OPEN_INSTALL_PROMPT_EVENT, handleManualOpen);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", markInstalled);
      window.removeEventListener(OPEN_INSTALL_PROMPT_EVENT, handleManualOpen);
    };
  }, [userId]);

  useEffect(() => {
    if (!isReady || !isProfileReady || isInstalled || isOpen) return;
    if (pathname.startsWith("/login") || pathname.startsWith("/cadastro")) return;

    const preference = readPreference(userId);
    if (preference.disableAutomaticPrompt || (preference.snoozeUntil || 0) > Date.now()) return;

    try {
      if (!countedSessionRef.current && !window.sessionStorage.getItem(sessionKey(userId))) {
        preference.visitCount = Number(preference.visitCount || 0) + 1;
        writePreference(userId, preference);
        window.sessionStorage.setItem(sessionKey(userId), "1");
        countedSessionRef.current = true;
      }
    } catch {
      // Sem armazenamento, o atalho manual em Mais continua disponível.
    }

    if (preference.visitCount < 2) return;
    const timer = window.setTimeout(() => {
      setOpenedManually(false);
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setIsOpen(true);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [isReady, isProfileReady, isInstalled, isOpen, pathname, userId]);

  function closePrompt() {
    if (!openedManually) {
      const preference = readPreference(userId);
      writePreference(userId, { ...preference, snoozeUntil: Date.now() + SNOOZE_DURATION });
    }
    setIsOpen(false);
    previousFocusRef.current?.focus?.();
  }

  async function installOnAndroid() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === "accepted") {
      const preference = readPreference(userId);
      writePreference(userId, { ...preference, installedAt: Date.now() });
      setIsInstalled(true);
      setIsOpen(false);
    }
  }

  if (!isOpen) return null;

  const hasNativeInstall = Boolean(deferredPrompt);

  return (
    <div
      className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePrompt();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Como instalar o app no celular"
        className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-5 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={closePrompt}
          className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-3 pr-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-accent/40 bg-[#020b07] shadow-[0_0_15px_rgba(204,255,0,0.15)]">
            <Image src="/icons/pelada-bq-v2-192.png" alt="Ícone Pelada" width={48} height={48} priority />
          </div>
          <div>
            <span className="font-athletic text-[9px] font-black uppercase italic tracking-widest text-accent">
              Web App Oficial
            </span>
            <h2 className="font-athletic text-lg font-black uppercase italic leading-tight text-foreground">
              Instale no Celular
            </h2>
            <p className="text-[10px] text-muted leading-tight">
              Acesso rápido sem precisar digitar endereço
            </p>
          </div>
        </div>

        {/* Abas de Sistema Operacional */}
        <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-black/40 p-1 border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab("ios")}
            className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
              activeTab === "ios"
                ? "bg-accent text-background font-black shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            iPhone (iOS)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("android")}
            className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
              activeTab === "android"
                ? "bg-accent text-background font-black shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Android
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5 space-y-2">
          {activeTab === "ios" ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted">
                No <strong>Safari</strong> do iPhone:
              </p>
              <ol className="space-y-2 text-xs">
                <li className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 font-black text-accent text-[11px]">
                    1
                  </span>
                  <div>
                    <span className="font-bold text-foreground flex items-center gap-1">
                      Toque em Compartilhar <Share2 className="h-3.5 w-3.5 text-accent inline" />
                    </span>
                    <p className="text-[10px] text-muted mt-0.5">
                      Na barra inferior do Safari
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 font-black text-accent text-[11px]">
                    2
                  </span>
                  <div>
                    <span className="font-bold text-foreground">
                      &quot;Adicionar à Tela de Início&quot;
                    </span>
                    <p className="text-[10px] text-muted mt-0.5">
                      Role o menu para baixo e selecione essa opção
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 font-black text-accent text-[11px]">
                    3
                  </span>
                  <div>
                    <span className="font-bold text-foreground">
                      Toque em &quot;Adicionar&quot;
                    </span>
                    <p className="text-[10px] text-muted mt-0.5">
                      O app ficará na sua tela inicial como um app nativo!
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-2">
              {hasNativeInstall ? (
                <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-center">
                  <Download className="mx-auto h-6 w-6 text-accent mb-1" />
                  <p className="text-xs font-black text-foreground">Instalação direta pronta</p>
                  <p className="text-[10px] text-muted mt-0.5">Toque no botão abaixo para adicionar</p>
                  <button
                    type="button"
                    onClick={installOnAndroid}
                    className="mt-3 w-full rounded-xl bg-accent py-2.5 text-xs font-black uppercase text-background shadow-md active:scale-95"
                  >
                    Instalar Agora
                  </button>
                </div>
              ) : null}

              <p className="text-[11px] font-semibold text-muted">
                No <strong>Chrome</strong> do Android:
              </p>
              <ol className="space-y-2 text-xs">
                <li className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 font-black text-accent text-[11px]">
                    1
                  </span>
                  <div>
                    <span className="font-bold text-foreground flex items-center gap-1">
                      Toque nos 3 pontinhos <MoreHorizontal className="h-3.5 w-3.5 text-accent inline" />
                    </span>
                    <p className="text-[10px] text-muted mt-0.5">
                      No canto superior direito do Chrome
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 font-black text-accent text-[11px]">
                    2
                  </span>
                  <div>
                    <span className="font-bold text-foreground">
                      &quot;Instalar aplicativo&quot; ou &quot;Adicionar à tela inicial&quot;
                    </span>
                    <p className="text-[10px] text-muted mt-0.5">
                      Selecione para criar o atalho
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 font-black text-accent text-[11px]">
                    3
                  </span>
                  <div>
                    <span className="font-bold text-foreground">
                      Confirme a instalação
                    </span>
                    <p className="text-[10px] text-muted mt-0.5">
                      O ícone do app abrirá em tela cheia sem barras do navegador!
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={closePrompt}
          className="mt-4 w-full rounded-xl bg-accent py-2.5 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_15px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

export function InstallAppEntry({ userId }: { userId?: string }) {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneMode());
  }, []);

  if (isStandalone) return null;

  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Aplicativo Web</h2>
      <div className="glass-card overflow-hidden">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_PROMPT_EVENT))}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Download className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-foreground">Instalar no Celular</span>
            <span className="block text-xs text-muted">Como adicionar o app na tela inicial do seu celular</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </div>
    </div>
  );
}
