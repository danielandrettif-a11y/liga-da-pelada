import { PlayersStatsGrid } from "@/components/PlayersStatsGrid";
import { CommunityCarousel } from "@/components/CommunityCarousel";
import { getRosterGroups } from "@/lib/actions/players";

export const revalidate = 0;

export default async function JogadoresPage() {
  const roster = await getRosterGroups();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Elenco</h1>
        <p className="mt-0.5 text-xs text-muted">Jogadores, convidados e a comunidade da pelada</p>
      </div>
      <section className="space-y-3">
        <div className="px-1"><h2 className="text-sm font-black text-foreground">Jogadores oficiais</h2><p className="text-[10px] text-muted">{roster.officialPlayers.length} atletas no Ranked</p></div>
        <PlayersStatsGrid players={roster.officialPlayers} />
      </section>
      {roster.activeGuests.length > 0 && (
        <section className="space-y-3">
          <div className="px-1"><h2 className="text-sm font-black text-foreground">Convidados ativos</h2><p className="text-[10px] text-muted">Participações temporárias com histórico preservado</p></div>
          <PlayersStatsGrid players={roster.activeGuests} />
        </section>
      )}
      <CommunityCarousel title="WAGs" subtitle="A comissão que acompanha a resenha" players={roster.wags} />
      <CommunityCarousel title="Torcida" subtitle="Quem empurra a pelada do lado de fora" players={roster.supporters} />
    </div>
  );
}
