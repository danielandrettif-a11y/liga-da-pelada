"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, X } from "@/components/icons";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  mode: "athlete" | "community";
};

const STORAGE_KEY = "bq_season_pass_rules_seen_v2";

export function SeasonPassRules({ mode }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useDialogViewport(showTutorial);

  useEffect(() => {
    setMounted(true);
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      setShowTutorial(true);
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, []);

  useEffect(() => {
    if (!showTutorial) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTutorial(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showTutorial]);

  const rules = [
    "Toda escalação completa, com a quantidade de atletas configurada na liga, avança +4 casas para qualquer perfil.",
    "Participar da pelada não avança casas: o avanço principal é igual para todos pelo Cartola.",
    "Jogadores oficiais recebem +1 ponto de loja a cada 5 participações em campo.",
    "WAGs e Torcida recebem +1 ponto de loja a cada 5 escalações válidas no Cartola.",
    "Após a casa 40, cada nova escalação válida também vira +4 pontos extras para a loja.",
  ];

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#a65cff]/35 bg-[#160c2c]/70">
        <button
          type="button"
          onClick={() => setShowTutorial(true)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
          aria-haspopup="dialog"
        >
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#a04dff]/20 text-[#d7adff]">
              <Crown className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-wide text-foreground">Como funciona o Passe BQ?</span>
              <span className="mt-0.5 block text-[10px] text-muted">Toque para ver as regras da trilha</span>
            </span>
          </span>
          <span className="text-lg font-black text-[#d7adff]">+</span>
        </button>
      </section>

      {mounted && showTutorial && createPortal(
        <div
          className="mobile-dialog-backdrop z-[100002] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Como funciona o Passe BQ"
          onClick={() => setShowTutorial(false)}
        >
          <section
            className="relative flex max-h-[min(88dvh,760px)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-[#a65cff]/45 bg-[#0b1510] shadow-[0_0_60px_rgba(0,0,0,0.9)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowTutorial(false)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Fechar explicação do Passe"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mobile-dialog-scroll flex-1 overflow-y-auto overscroll-contain">
              <div className="bg-gradient-to-br from-[#4b1b8d] via-[#251047] to-[#0b1510] p-6 pr-16">
                <Crown className="h-10 w-10 text-[#e0b9ff]" />
                <p className="mt-4 font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-[#d7adff]">Bem-vindo ao Passe BQ</p>
                <h2 className="mt-1 font-athletic text-3xl font-black uppercase italic text-white">Sua trilha da temporada</h2>
              <p className="mt-3 text-sm leading-6 text-white/70">Complete 40 casas pelo Cartola. A regra é a mesma para atletas, WAGs e Torcida.</p>
              </div>
              <RulesContent mode={mode} rules={rules} />
            </div>
            <div className="border-t border-white/10 bg-[#0b1510] p-4">
              <button type="button" onClick={() => setShowTutorial(false)} className="w-full rounded-2xl bg-accent py-3 text-xs font-black uppercase text-background">Entendi, vamos jogar</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

function RulesContent({ mode, rules }: { mode: Props["mode"]; rules: string[] }) {
  return (
    <div className="p-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-accent">Avanço igual para todos</p>
      <ul className="mt-2.5 space-y-2 text-xs leading-5 text-muted">
        {rules.map((rule) => <li key={rule} className="flex gap-2"><span className="mt-1 text-[#d7adff]">◆</span><span>{rule}</span></li>)}
      </ul>
    </div>
  );
}
