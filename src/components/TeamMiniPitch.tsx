"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { TeamCrest } from "./TeamCrest";
import { TeamReferenceBadge } from "./TeamReferenceBadge";
import { ChevronDown, Crown, Loader2 } from "@/components/icons";
import { setRoundTeamCaptain, setRoundTeamVestColor } from "@/lib/actions/rounds";
import { VEST_COLORS } from "@/lib/vest-colors";

type PitchPlayerProfile = string | null | undefined;

type PitchPlayerDetails = {
  id: string;
  name: string;
  avatar_url?: string | null;
  player_profile?: PitchPlayerProfile;
  is_goalkeeper?: boolean;
};

type PitchPlayer = {
  player_id: string;
  goalkeeper_order?: number | null;
  loan_order?: number | null;
  cartola_points?: number;
  players?: PitchPlayerDetails | null;
};

type TeamMiniPitchProps = {
  team: {
    id: string;
    name: string;
    color: string;
    crest_url?: string | null;
    position?: number | null;
    captain_player_id?: string | null;
    team_players: PitchPlayer[];
  };
  index: number;
  selectedPlayerId?: string;
  onPlayerClick?: (player: Player) => void;
  showPositionDetails?: boolean;
  roundId?: string;
  canManageIdentity?: boolean;
};

const POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[26, 50], [74, 50]],
  3: [[50, 23], [26, 70], [74, 70]],
  4: [[26, 28], [74, 28], [26, 72], [74, 72]],
  5: [[50, 17], [26, 48], [74, 48], [26, 79], [74, 79]],
  6: [[26, 18], [74, 18], [50, 42], [26, 66], [74, 66], [50, 85]],
  7: [[50, 12], [25, 32], [75, 32], [25, 54], [75, 54], [25, 80], [75, 80]],
  8: [[25, 12], [75, 12], [25, 36], [75, 36], [25, 60], [75, 60], [25, 84], [75, 84]],
  9: [[50, 9], [25, 28], [75, 28], [25, 48], [75, 48], [25, 68], [75, 68], [25, 87], [75, 87]],
  10: [[25, 9], [75, 9], [25, 28], [75, 28], [25, 48], [75, 48], [25, 68], [75, 68], [25, 87], [75, 87]],
};

const ROLE_ROW_TOP: Record<string, number> = {
  "ATA/ALA": 25,
  "DEF/VOL": 66,
  GOL: 86,
};

const ROW_HORIZONTAL_POSITIONS: Record<number, number[]> = {
  1: [50],
  2: [27, 73],
  3: [18, 50, 82],
  4: [14, 38, 62, 86],
  5: [11, 30, 50, 70, 89],
  6: [9, 25, 41, 59, 75, 91],
};

function getPitchPosition(player: PitchPlayerDetails) {
  if (player.is_goalkeeper) {
    return { label: "GOL", priority: 3, className: "border-sky-300/40 bg-sky-400/15 text-sky-100" };
  }
  if (player.player_profile === "offensive") {
    return { label: "ATA/ALA", priority: 0, className: "border-rose-300/35 bg-rose-400/15 text-rose-100" };
  }
  if (player.player_profile === "defensive") {
    return { label: "DEF/VOL", priority: 2, className: "border-blue-300/35 bg-blue-400/15 text-blue-100" };
  }
  return { label: "ATA/ALA", priority: 0, className: "border-rose-300/35 bg-rose-400/15 text-rose-100" };
}

function getPositionAwareCoordinates(players: Array<{ player: PitchPlayerDetails }>) {
  const countByRole = new Map<string, number>();
  for (const item of players) {
    const label = getPitchPosition(item.player).label;
    countByRole.set(label, (countByRole.get(label) || 0) + 1);
  }

  const indexByRole = new Map<string, number>();
  const coordinates = players.map((item) => {
    const label = getPitchPosition(item.player).label;
    const playerIndex = indexByRole.get(label) || 0;
    const playersInRole = countByRole.get(label) || 1;
    indexByRole.set(label, playerIndex + 1);
    const row = ROLE_ROW_TOP[label] ?? 50;
    const horizontalPositions = ROW_HORIZONTAL_POSITIONS[Math.min(playersInRole, 6)] || [50];
    return [horizontalPositions[playerIndex] ?? 50, row] as [number, number];
  });

  return { coordinates, countByRole };
}

export function TeamMiniPitch({ team, index, selectedPlayerId, onPlayerClick, showPositionDetails = false, roundId, canManageIdentity = false }: TeamMiniPitchProps) {
  const router = useRouter();
  const [captainId, setCaptainId] = useState(team.captain_player_id || "");
  const [teamColor, setTeamColor] = useState(team.color || "#22c55e");
  const [colorSelectorOpen, setColorSelectorOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const playerEntries = team.team_players
    .flatMap((entry) => entry.players ? [{
      player: entry.players,
      goalkeeperOrder: entry.goalkeeper_order ?? null,
      loanOrder: entry.loan_order ?? null,
      cartolaPoints: Number(entry.cartola_points || 0),
    }] : []);
  const players = showPositionDetails
    ? playerEntries.sort((a, b) => {
      const roleDifference = getPitchPosition(a.player).priority - getPitchPosition(b.player).priority;
      if (roleDifference !== 0) return roleDifference;
      if (b.cartolaPoints !== a.cartolaPoints) return b.cartolaPoints - a.cartolaPoints;
      return a.player.name.localeCompare(b.player.name, "pt-BR");
    })
    : playerEntries;
  const visiblePlayers = players.slice(0, 10);
  const positionAwareLayout = getPositionAwareCoordinates(visiblePlayers);
  const positions = showPositionDetails
    ? positionAwareLayout.coordinates
    : POSITIONS[Math.max(1, visiblePlayers.length)];
  const isCrowded = visiblePlayers.length > 6;

  async function chooseCaptain(playerId: string) {
    if (!canManageIdentity || !roundId || pending) return;
    const previous = captainId;
    const next = previous === playerId ? "" : playerId;
    setCaptainId(next);
    setPending(true);
    setMessage("");
    const result = await setRoundTeamCaptain(roundId, team.id, next || null);
    if (!result.success) {
      setCaptainId(previous);
      setMessage(result.error || "Não foi possível definir o capitão.");
    } else router.refresh();
    setPending(false);
  }

  async function chooseColor(color: string) {
    if (!canManageIdentity || !roundId || pending || color === teamColor) return;
    const previous = teamColor;
    setTeamColor(color);
    setPending(true);
    setMessage("");
    const result = await setRoundTeamVestColor(roundId, team.id, color);
    if (!result.success) {
      setTeamColor(previous);
      setMessage(result.error || "Não foi possível mudar o colete.");
    } else {
      setColorSelectorOpen(false);
      router.refresh();
    }
    setPending(false);
  }

  return (
    <article className={`glass-card min-w-0 overflow-hidden p-1.5 animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}>
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 px-0.5 py-0.5">
        <TeamReferenceBadge position={team.position} fallbackIndex={index} color={teamColor} className="h-7 w-7 text-sm" />
        <div className="min-w-0 flex-1">
          <span className="block text-[7px] font-black uppercase leading-none tracking-wide text-muted">Time</span>
          <h3 className="truncate text-[9px] font-bold leading-tight text-foreground/75" title={team.name}>
            {team.name}
          </h3>
        </div>
        <TeamCrest name={team.name} crestUrl={team.crest_url} color={teamColor} className="h-5 w-5" />
        <span className="shrink-0 text-[7px] font-black text-muted">{visiblePlayers.length}J</span>
      </div>

      <div className="mb-1 flex items-center justify-end px-0.5">
        <span className="rounded bg-accent/10 px-1 py-0.5 text-[7px] font-black uppercase leading-none text-accent">
          G = gol · E = empréstimo
        </span>
      </div>

      <div
        className={`relative overflow-hidden rounded-lg border border-white/25 shadow-[inset_0_0_22px_rgba(0,0,0,.3)] ${
          showPositionDetails ? "h-[286px]" : "h-[196px]"
        }`}
        style={{
          background: "repeating-linear-gradient(90deg, #0d5b32 0, #0d5b32 24px, #0b512c 24px, #0b512c 48px)",
        }}
      >
        <div className="absolute inset-1.5 border border-white/30" />
        <div className="absolute inset-x-1.5 top-1/2 h-px bg-white/30" />
        <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
        <div className="absolute left-1/2 top-1.5 h-6 w-12 -translate-x-1/2 border border-t-0 border-white/30" />
        <div className="absolute bottom-1.5 left-1/2 h-6 w-12 -translate-x-1/2 border border-b-0 border-white/30" />

        {visiblePlayers.map(({ player, goalkeeperOrder, loanOrder, cartolaPoints }, playerIndex) => {
          const [left, top] = positions[playerIndex];
          const position = getPitchPosition(player);
          const playersInRole = positionAwareLayout.countByRole.get(position.label) || 1;
          const widthClass = !showPositionDetails
            ? "w-[48%]"
            : playersInRole >= 4
              ? "w-[22%]"
              : playersInRole === 3
                ? "w-[30%]"
                : "w-[44%]";
          return (
            <button
              key={player.id}
              type="button"
              disabled={!onPlayerClick && !showPositionDetails && !canManageIdentity}
              onClick={() => onPlayerClick ? onPlayerClick(player as Player) : void chooseCaptain(player.id)}
              aria-pressed={canManageIdentity ? captainId === player.id : onPlayerClick ? selectedPlayerId === player.id : undefined}
              className={`absolute flex ${widthClass} -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-md transition-transform enabled:cursor-pointer enabled:active:scale-95 ${selectedPlayerId === player.id ? "z-10 ring-2 ring-accent" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={`${player.name}${goalkeeperOrder ? ` · G${goalkeeperOrder}` : ""}${loanOrder ? ` · E${loanOrder}` : ""}`}
            >
              <div className="pointer-events-none relative rounded-full border-2" style={{ borderColor: teamColor }}>
                <PlayerAvatar
                  name={player.name}
                  playerId={showPositionDetails ? player.id : undefined}
                  avatarUrl={player.avatar_url}
                  className={`${isCrowded ? "h-6 w-6 text-[7px]" : "h-8 w-8 text-[8px]"} rounded-full bg-[#07170f] font-black text-white shadow-[0_4px_9px_rgba(0,0,0,.5)]`}
                  imageClassName="object-cover"
                />
                {goalkeeperOrder && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-accent px-0.5 font-athletic text-[8px] font-black leading-none text-background shadow-[0_2px_6px_rgba(0,0,0,.55)]"
                    aria-label={`${goalkeeperOrder}º na ordem do gol`}
                  >
                    {goalkeeperOrder}
                  </span>
                )}
                {loanOrder && (
                  <span
                    className="absolute -left-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-sky-400 px-0.5 font-athletic text-[8px] font-black leading-none text-background shadow-[0_2px_6px_rgba(0,0,0,.55)]"
                    aria-label={`${loanOrder}º na fila de empréstimo`}
                  >
                    {loanOrder}
                  </span>
                )}
                {captainId === player.id && (
                  <span className="absolute -bottom-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-warning px-0.5 text-background shadow-[0_2px_6px_rgba(0,0,0,.55)]" aria-label="Capitão do time" title="Capitão">
                    <Crown className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
              <span className={`pointer-events-none mt-0.5 block w-full truncate whitespace-nowrap rounded bg-black/75 px-0.5 py-0.5 text-center font-black leading-tight text-white shadow-sm ${isCrowded ? "text-[6px]" : "text-[8px]"}`}>
                {player.name}
              </span>
              {showPositionDetails && (
                <span
                  className={`mt-0.5 rounded border px-1 py-0.5 text-center font-black leading-none ${position.className} ${isCrowded ? "text-[5px]" : "text-[7px]"}`}
                  title={`${position.label} · ${cartolaPoints.toFixed(1)} pontos no Cartola`}
                >
                  {position.label} · {cartolaPoints.toFixed(1)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {canManageIdentity && (
        <div className="mt-1.5 rounded-lg border border-border/70 bg-background/55 p-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => setColorSelectorOpen((current) => !current)}
            aria-expanded={colorSelectorOpen}
            className="flex min-h-7 w-full items-center justify-between gap-1 rounded-md px-1 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <span className="text-[7px] font-black uppercase text-foreground">Colete</span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white" style={{ backgroundColor: teamColor }} />
              <ChevronDown className={`h-3 w-3 shrink-0 text-accent transition-transform ${colorSelectorOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {colorSelectorOpen && <div className="mt-1.5 border-t border-white/10 pt-1.5">
            <p className="mb-1 text-center text-[6px] font-black uppercase tracking-wide text-muted">Escolha a cor</p>
            <div className="grid grid-cols-4 gap-1.5">
              {VEST_COLORS.map((vest) => (
                <button
                  key={vest.color}
                  type="button"
                  disabled={pending}
                  onClick={() => void chooseColor(vest.color)}
                  className={`mx-auto h-4 w-4 shrink-0 rounded-full border-2 transition-transform active:scale-90 ${teamColor.toLowerCase() === vest.color.toLowerCase() ? "scale-110 border-white ring-1 ring-accent" : "border-black/40"}`}
                  style={{ backgroundColor: vest.color }}
                  aria-label={`Colete ${vest.label}`}
                  title={vest.label}
                />
              ))}
              {pending && <Loader2 className="col-span-4 mx-auto h-4 w-4 animate-spin text-accent" />}
            </div>
          </div>}
          <p className="mt-1 text-center text-[7px] font-bold leading-tight text-muted">Toque na foto ou no nome para {captainId ? "trocar" : "escolher"} o capitão</p>
          {message && <p className="mt-1 text-center text-[7px] font-bold text-danger">{message}</p>}
        </div>
      )}
    </article>
  );
}
