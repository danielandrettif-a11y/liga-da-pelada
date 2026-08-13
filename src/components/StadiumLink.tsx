import { Stadium } from "@/components/icons";

export function StadiumLink({ name, mapUrl }: { name?: string | null; mapUrl?: string | null }) {
  if (!mapUrl) return null;
  return (
    <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4 transition-colors hover:border-accent/40 hover:bg-accent/10">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><Stadium className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-black uppercase tracking-wider text-muted">Estadio da pelada</span><span className="mt-0.5 block text-sm font-black text-foreground">Veja onde fica o estadio</span>{name && <span className="mt-0.5 block truncate text-[10px] text-muted">{name}</span>}</span>
    </a>
  );
}
