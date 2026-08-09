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
  const [isReady, setIsReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openedManually, setOpenedManually] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const currentPlatform = detectPlatform();
    const standalone = isStandaloneMode();
    setPlatform(currentPlatform);
    setIsInstalled(standalone);
    setIsReady(true);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      const preference = readPreference(userId);
      if (preference.installedAt) {
        delete preference.installedAt;
        writePreference(userId, preference);
      }
      setIsInstalled(false);
    };

    const markInstalled = () => {
      const preference = readPreference(userId);
      writePreference(userId, { ...preference, installedAt: Date.now() });
      setIsInstalled(true);
      setIsOpen(false);
    };

    const handleManualOpen = () => {
      if (isStandaloneMode() || detectPlatform() === "unsupported") return;
      setOpenedManually(true);
      setIsOpen(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", markInstalled);
    window.addEventListener(OPEN_INSTALL_PROMPT_EVENT, handleManualOpen);

    const navigatorWithPwa = navigator as NavigatorWithPwa;
    if (!standalone && navigatorWithPwa.getInstalledRelatedApps) {
      navigatorWithPwa.getInstalledRelatedApps()
        .then((apps) => {
          if (apps.length > 0) markInstalled();
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", markInstalled);
      window.removeEventListener(OPEN_INSTALL_PROMPT_EVENT, handleManualOpen);
    };
  }, [userId]);

  useEffect(() => {
    if (!isReady || countedSessionRef.current) return;
    countedSessionRef.current = true;

    try {
      if (!window.sessionStorage.getItem(sessionKey(userId))) {
        window.sessionStorage.setItem(sessionKey(userId), "1");
        const preference = readPreference(userId);
        writePreference(userId, {
          ...preference,
          visitCount: Math.min((preference.visitCount || 0) + 1, 2),
        });
      }
    } catch {
      // Sem sessionStorage, o acesso manual em Mais continua disponível.
    }
  }, [isReady, userId]);

  useEffect(() => {
    if (!isReady || platform === "unsupported" || isInstalled || !isProfileReady || pathname !== "/") {
      return;
    }

    const preference = readPreference(userId);
    const isSnoozed = Boolean(preference.snoozeUntil && preference.snoozeUntil > Date.now());
    if (preference.visitCount < 2 || preference.disableAutomaticPrompt || preference.installedAt || isSnoozed) {
      return;
    }

    const timer = window.setTimeout(() => {
      setOpenedManually(false);
      setIsOpen(true);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [isInstalled, isProfileReady, isReady, pathname, platform, userId]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePrompt();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
    // closePrompt apenas usa estados e localStorage; manter este efeito ligado à abertura evita refocar durante atualizações internas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function closePrompt() {
    if (!openedManually) {
      const preference = readPreference(userId);
      writePreference(userId, { ...preference, snoozeUntil: Date.now() + SNOOZE_DURATION });
    }
    setIsOpen(false);
  }

  function disableAutomaticPrompt() {
    const preference = readPreference(userId);
    writePreference(userId, { ...preference, disableAutomaticPrompt: true });
    setIsOpen(false);
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
    } else {
      closePrompt();
    }
  }

  if (!isOpen || !isReady || isInstalled) return null;

  const hasNativeInstall = platform === "android" && Boolean(deferredPrompt);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 px-3 backdrop-blur-[3px] animate-fade-in"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePrompt();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-title"
        aria-describedby="install-app-description"
        className="mb-[max(.75rem,env(safe-area-inset-bottom))] w-full max-w-md overflow-hidden rounded-[1.75rem] border border-accent/25 bg-[#08150e] shadow-[0_-18px_70px_rgba(0,0,0,.55),0_0_35px_rgba(204,255,0,.08)] animate-slide-in-bottom"
      >
        <div className="h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />
        <div className="relative p-5 pb-3 text-center">
          <button
            type="button"
            onClick={closePrompt}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition-colors hover:bg-white/10 hover:text-foreground"
            aria-label="Fechar sugestão de instalação"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-[0_0_24px_rgba(204,255,0,.18)]">
            <Image src="/icons/app-icon.svg" alt="" width={64} height={64} priority />
          </div>
          <p className="mb-1 font-athletic text-[10px] font-black uppercase tracking-[.22em] text-accent">
            Leve a pelada com você
          </p>
          <h2 id="install-app-title" className="font-athletic text-2xl font-black uppercase italic text-foreground">
            Instale o Pelada
          </h2>
          <p id="install-app-description" className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted">
            Abra mais rápido toda semana, direto da tela inicial do celular.
          </p>
        </div>

        <div className="px-5 pb-5">
          {hasNativeInstall ? (
            <div className="rounded-2xl border border-accent/20 bg-accent/[0.06] p-4 text-center">
              <Download className="mx-auto mb-2 h-8 w-8 text-accent" strokeWidth={1.7} />
              <p className="text-sm font-bold text-foreground">Instalação rápida disponível</p>
              <p className="mt-1 text-xs text-muted">O Android fará a confirmação final para você.</p>
              <button type="button" onClick={installOnAndroid} className="btn-primary mt-4 w-full">
                Instalar agora
              </button>
            </div>
          ) : platform === "ios-other" ? (
            <div className="rounded-2xl border border-warning/25 bg-warning/[0.07] p-4 text-center">
              <Share2 className="mx-auto mb-2 h-7 w-7 text-warning" />
              <p className="text-sm font-bold text-foreground">Abra esta página no Safari</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                No iPhone, a instalação pela tela inicial precisa ser concluída no Safari.
              </p>
            </div>
          ) : (
            <ol className="space-y-2" aria-label="Passos para instalar o aplicativo">
              {platform === "ios-safari" ? (
                <>
                  <InstallStep number={1} icon={<Share2 className="h-4 w-4" />}>Toque em Compartilhar</InstallStep>
                  <InstallStep number={2} icon={<Download className="h-4 w-4" />}>Escolha “Adicionar à Tela de Início”</InstallStep>
                  <InstallStep number={3} icon={<Check className="h-4 w-4" />}>Ative “Abrir como App da Web” e adicione</InstallStep>
                </>
              ) : (
                <>
                  <InstallStep number={1} icon={<MoreHorizontal className="h-4 w-4" />}>Abra o menu do navegador</InstallStep>
                  <InstallStep number={2} icon={<Download className="h-4 w-4" />}>Toque em “Instalar app” ou “Adicionar à tela inicial”</InstallStep>
                  <InstallStep number={3} icon={<Check className="h-4 w-4" />}>Confirme a instalação</InstallStep>
                </>
              )}
            </ol>
          )}

          {!hasNativeInstall && (
            <button type="button" onClick={closePrompt} className="mt-4 w-full rounded-xl border border-accent/30 bg-accent/10 py-3 text-sm font-black text-accent transition-colors hover:bg-accent/15">
              {openedManually ? "Fechar" : "Agora não"}
            </button>
          )}

          {hasNativeInstall && (
            <button type="button" onClick={closePrompt} className="mt-3 w-full py-2 text-sm font-bold text-muted hover:text-foreground">
              {openedManually ? "Fechar" : "Agora não"}
            </button>
          )}

          {!openedManually && (
            <button type="button" onClick={disableAutomaticPrompt} className="mt-1 w-full py-2 text-xs font-semibold text-muted/70 underline decoration-white/15 underline-offset-4 hover:text-muted">
              Não mostrar novamente neste aparelho
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InstallAppEntry({ userId }: { userId: string }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = async () => {
      if (detectPlatform() === "unsupported" || isStandaloneMode()) {
        setIsVisible(false);
        return;
      }

      const navigatorWithPwa = navigator as NavigatorWithPwa;
      if (navigatorWithPwa.getInstalledRelatedApps) {
        try {
          const apps = await navigatorWithPwa.getInstalledRelatedApps();
          if (apps.length > 0) {
            setIsVisible(false);
            return;
          }
        } catch {
          // Continua com a preferência local quando a API não está disponível de fato.
        }
      }

      setIsVisible(!readPreference(userId).installedAt);
    };

    const handleBeforeInstall = () => {
      const preference = readPreference(userId);
      if (preference.installedAt) {
        delete preference.installedAt;
        writePreference(userId, preference);
      }
      setIsVisible(true);
    };

    void updateVisibility();
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", updateVisibility);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", updateVisibility);
    };
  }, [userId]);

  if (!isVisible) return null;

  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Aplicativo</h2>
      <div className="glass-card overflow-hidden">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_PROMPT_EVENT))}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
            <Download className="h-5 w-5 text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Instalar aplicativo</span>
            <span className="block text-xs text-muted">Adicionar à tela inicial deste celular</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </div>
    </div>
  );
}
