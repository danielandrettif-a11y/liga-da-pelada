import Image from "next/image";

export function TeamCrest({
  name,
  crestUrl,
  color,
  className = "h-5 w-5",
}: {
  name: string;
  crestUrl?: string | null;
  color?: string | null;
  className?: string;
}) {
  if (!crestUrl) {
    return (
      <span
        className={`inline-block shrink-0 rounded-full border border-white/15 ${className}`}
        style={{ backgroundColor: color || "#64748B" }}
        aria-hidden="true"
      />
    );
  }

  return (
    <Image
      src={crestUrl}
      alt={`Escudo do ${name}`}
      width={96}
      height={96}
      sizes="96px"
      className={`shrink-0 object-contain drop-shadow-[0_3px_7px_rgba(0,0,0,.45)] ${className}`}
    />
  );
}
