"use client";

import { useEffect, useState } from "react";
import { Football, UsersRound } from "@/components/icons";

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function GreetingBanner({ name }: { name: string | null }) {
  const [greeting, setGreeting] = useState("Olá");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <section className="relative min-h-[190px] overflow-hidden rounded-3xl border border-accent/30 bg-[#020b07] p-5 shadow-[0_20px_60px_rgba(0,0,0,.35)] animate-fade-in">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(204,255,0,.18),transparent_30%),linear-gradient(135deg,transparent_48%,rgba(204,255,0,.035)_49%,rgba(204,255,0,.035)_52%,transparent_53%)]" />
      <div className="absolute -bottom-20 -right-16 h-52 w-52 rounded-full border border-accent/20" />
      <div className="absolute -bottom-12 -right-8 h-36 w-36 rounded-full border border-accent/15" />

      <div className="relative z-10 max-w-[72%]">
        <p className="mb-3 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[10px] font-black uppercase tracking-[0.18em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          {greeting}{name ? `, ${name}` : ""}
        </p>

        <h1 className="font-athletic uppercase italic leading-[0.83] tracking-tight">
          <span className="block text-[38px] font-black text-accent">Pelada</span>
          <span className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-black text-accent">de</span>
            <span className="text-[31px] font-black text-white">Baixa</span>
          </span>
          <span className="mt-2 block text-[25px] font-black tracking-[0.08em] text-accent">Qualidade</span>
        </h1>

        <p className="mt-4 text-[11px] font-semibold text-white/55">Futebol sério. Resenha nem tanto.</p>
      </div>

      <div className="absolute bottom-5 right-4 flex h-24 w-24 items-center justify-center rounded-[2rem] border-2 border-accent bg-accent/10 text-accent shadow-[0_0_35px_rgba(204,255,0,.12)]">
        <UsersRound className="h-12 w-12" strokeWidth={1.8} />
        <span className="absolute -bottom-2 -left-2 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#020b07] bg-white text-[#07100b] shadow-xl" aria-hidden="true">
          <Football className="h-8 w-8" strokeWidth={1.7} />
        </span>
      </div>
    </section>
  );
}
