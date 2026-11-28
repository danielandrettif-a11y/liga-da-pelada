"use client";

import { useMemo, useState } from "react";
import type { DualPositionScoringSettings, PositionBalanceScoutRow } from "@/lib/actions/bq-scoring";

const POSITIONS = ["DEF", "MEI", "ALA", "ATA"] as const;
type Position = typeof POSITIONS[number];

function pointsFor(row: PositionBalanceScoutRow, position: Position, settings: DualPositionScoringSettings) {
  const rule = settings.positionRules[position];
  return row.goals * rule.goal
    + row.assists * rule.assist
    + row.lineCleanSheets * rule.cleanSheet
    + row.lineGoalsConceded * rule.conceded
    + row.ownGoals * rule.ownGoal;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function PositionBalancePanel({
  rows,
  settings,
}: {
  rows: PositionBalanceScoutRow[];
  settings: DualPositionScoringSettings;
}) {
  const [windowSize, setWindowSize] = useState<10 | 20 | 30 | "all">(10);
  const result = useMemo(() => {
    const roundNumbers = [...new Set(rows.map((row) => row.roundNumber))].sort((a, b) => b - a);
    const selected = new Set(windowSize === "all" ? roundNumbers : roundNumbers.slice(0, windowSize));
    const scoped = rows.filter((row) => selected.has(row.roundNumber));
    const appearances = scoped.reduce((sum, row) => sum + row.games, 0);
    const pure = POSITIONS.map((position) => {
      const total = scoped.reduce((sum, row) => sum + pointsFor(row, position, settings), 0);
      return { position, average: appearances ? total / appearances : 0, appearances };
    });
    const generalAverage = pure.reduce((sum, item) => sum + item.average, 0) / pure.length;
    const combinations = POSITIONS.flatMap((primary) => POSITIONS
      .filter((secondary) => secondary !== primary)
      .map((secondary) => {
        const total = scoped.reduce((sum, row) => sum
          + pointsFor(row, primary, settings) * settings.primaryWeight
          + pointsFor(row, secondary, settings) * settings.secondaryWeight, 0);
        return { label: `${primary}/${secondary}`, average: appearances ? total / appearances : 0, appearances };
      }))
      .sort((a, b) => b.average - a.average);
    const actualGroups = new Map<string, { points: number; games: number }>();
    for (const row of scoped) {
      if (!row.primaryPosition || (row.secondaryPosition && row.primaryPosition === row.secondaryPosition)) continue;
      const isDual = Boolean(row.secondaryPosition);
      const label = isDual ? `${row.primaryPosition}/${row.secondaryPosition}` : `${row.primaryPosition} · Fixo 100%`;
      const current = actualGroups.get(label) || { points: 0, games: 0 };
      current.points += isDual && row.secondaryPosition
        ? pointsFor(row, row.primaryPosition, settings) * settings.primaryWeight
          + pointsFor(row, row.secondaryPosition, settings) * settings.secondaryWeight
        : pointsFor(row, row.primaryPosition, settings);
      current.games += row.games;
      actualGroups.set(label, current);
    }
    const actual = [...actualGroups.entries()].map(([label, value]) => ({
      label, average: value.games ? value.points / value.games : 0, appearances: value.games,
    })).sort((a, b) => b.average - a.average);
    const evolution = [...selected].sort((a, b) => b - a).slice(0, 10).map((roundNumber) => {
      const roundRows = scoped.filter((row) => row.roundNumber === roundNumber);
      const games = roundRows.reduce((sum, row) => sum + row.games, 0);
      return {
        roundNumber,
        averages: Object.fromEntries(POSITIONS.map((position) => [position,
          games ? roundRows.reduce((sum, row) => sum + pointsFor(row, position, settings), 0) / games : 0,
        ])) as Record<Position, number>,
      };
    });
    return { scoped, pure, generalAverage, combinations, actual, evolution };
  }, [rows, settings, windowSize]);

  return (
    <section className="space-y-3">
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">Balanceamento de posições</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted">Simulação somente leitura. “Fórmula” aplica cada tabela aos mesmos scouts históricos; “real” usa apenas pares que já estavam congelados, sem inventar posições secundárias.</p>
          </div>
          <select value={windowSize} onChange={(event) => setWindowSize(event.target.value === "all" ? "all" : Number(event.target.value) as 10 | 20 | 30)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground">
            <option value={10}>Últimas 10</option><option value={20}>Últimas 20</option>
            <option value={30}>Últimas 30</option><option value="all">Todo compatível</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {result.pure.map((item) => {
          const difference = result.generalAverage ? (item.average / result.generalAverage - 1) * 100 : 0;
          const warning = Math.abs(difference) > 10;
          return <div key={item.position} className={`glass-card p-4 ${warning ? "border border-orange-400/40" : ""}`}>
            <p className="text-xs font-black text-accent">{item.position}</p>
            <p className="mt-2 text-2xl font-black text-foreground">{item.average.toFixed(2)}</p>
            <p className={`mt-1 text-[10px] font-bold ${warning ? "text-orange-300" : "text-muted"}`}>{signed(difference)} da média · {item.appearances} atuações</p>
          </div>;
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass-card overflow-hidden">
          <div className="border-b border-border p-3"><p className="text-xs font-black uppercase text-muted">12 combinações · equilíbrio da fórmula</p></div>
          <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-3">
            {result.combinations.map((item) => <div key={item.label} className="bg-surface/80 p-3">
              <p className="text-[10px] font-bold text-muted">{item.label}</p><p className="text-base font-black text-foreground">{item.average.toFixed(2)}</p>
            </div>)}
          </div>
        </div>
        <div className="glass-card overflow-hidden">
          <div className="border-b border-border p-3"><p className="text-xs font-black uppercase text-muted">Equilíbrio real por par congelado</p></div>
          {result.actual.length ? result.actual.map((item) => <div key={item.label} className="flex items-center justify-between border-b border-border/60 px-3 py-2 last:border-b-0">
            <span className="text-xs font-bold text-foreground">{item.label}</span><span className="text-xs text-muted">{item.average.toFixed(2)} · {item.appearances} atuações</span>
          </div>) : <p className="p-4 text-xs leading-relaxed text-muted">Ainda não há rodadas encerradas com posição secundária congelada. O painel começará a preencher esta comparação após a primeira rodada v15.</p>}
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead className="bg-surface/80 text-[10px] uppercase text-muted"><tr><th className="p-3">Rodada</th>{POSITIONS.map((position) => <th key={position} className="p-3 text-right">{position}</th>)}</tr></thead>
          <tbody>{result.evolution.map((item) => <tr key={item.roundNumber} className="border-t border-border/60"><td className="p-3 font-bold text-foreground">R{item.roundNumber}</td>{POSITIONS.map((position) => <td key={position} className="p-3 text-right text-muted">{item.averages[position].toFixed(2)}</td>)}</tr>)}</tbody>
        </table>
      </div>

      <p className="px-1 text-[10px] leading-relaxed text-muted">Limitação histórica: rodadas anteriores não guardavam posição secundária nem participação de linha compatível com v15. A comparação da fórmula reutiliza apenas os scouts existentes e não altera resultados oficiais.</p>
    </section>
  );
}
