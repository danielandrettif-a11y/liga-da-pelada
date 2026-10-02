import { getTeamReference } from "@/lib/team-reference";

export function TeamReferenceBadge({
  position,
  fallbackIndex = 0,
  color,
  className = "h-8 w-8 text-base",
}: {
  position?: number | null;
  fallbackIndex?: number;
  color?: string | null;
  className?: string;
}) {
  const reference = getTeamReference({ position }, fallbackIndex);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border-2 bg-background/80 font-athletic font-black leading-none text-foreground shadow-sm ${className}`}
      style={{ borderColor: color || "#64748B" }}
      aria-label={`Time ${reference}`}
    >
      {reference}
    </span>
  );
}
