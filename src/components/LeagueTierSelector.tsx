"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

type LeagueTier = "basic" | "complete";

const tiers: Array<{
  value: LeagueTier;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    value: "basic",
    eyebrow: "Básica",
    title: "Organização e ranking",
    description: "Elenco, convocações, rodadas, scouts e classificação. Pode ser ampliada para Completa depois.",
  },
  {
    value: "complete",
    eyebrow: "Completa",
    title: "A experiência toda",
    description: "Tudo da Básica, mais Cartola, cosméticos e recursos extras da pelada.",
  },
];

export function LeagueTierSelector() {
  const [selected, setSelected] = useState<LeagueTier>("basic");

  return <>
  <fieldset>
    <legend className="text-sm font-bold text-white">Modo da pelada</legend>
    <p className="mt-1 text-xs leading-5 text-muted">Toque no modelo que deseja usar.</p>
    <div className="mt-3 space-y-3">
      {tiers.map((tier) => {
        const active = selected === tier.value;
        return <label
          key={tier.value}
          className={cn(
            "relative block cursor-pointer rounded-2xl border p-5 transition-colors focus-within:ring-2 focus-within:ring-accent/70",
            active ? "border-accent bg-accent/10" : "border-border bg-background/45 hover:border-accent/40",
          )}
        >
          <input
            type="radio"
            name="tier"
            value={tier.value}
            checked={active}
            onChange={() => setSelected(tier.value)}
            className="sr-only"
          />
          <span className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-wider text-accent">{tier.eyebrow}</span>
            <span className={cn(
              "grid h-6 w-6 place-items-center rounded-full border text-xs font-black",
              active ? "border-accent bg-accent text-background" : "border-border text-transparent",
            )} aria-hidden="true">✓</span>
          </span>
          <strong className="mt-2 block text-xl font-black text-white">{tier.title}</strong>
          <span className="mt-2 block text-sm leading-6 text-muted">{tier.description}</span>
          {active && <span className="mt-3 inline-flex rounded-full bg-accent px-2.5 py-1 text-[10px] font-black uppercase text-background">Selecionada</span>}
        </label>;
      })}
    </div>
  </fieldset>
  <label className="block text-sm font-bold text-white">Acesso
    <select name="visibility" defaultValue="private" className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-white">
      <option value="private">Fechada — jogadores solicitam entrada</option>
      <option value="open">Aberta — qualquer jogador pode entrar</option>
    </select>
  </label>
  </>;
}
