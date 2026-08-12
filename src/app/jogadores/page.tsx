import { RosterDirectory } from "@/components/RosterDirectory";
import { getRosterGroups } from "@/lib/actions/players";
import { getUnreadRosterPlayers } from "@/lib/actions/registrations";

export const revalidate = 0;

export default async function JogadoresPage() {
  const [roster, unreadRoster] = await Promise.all([
    getRosterGroups(),
    getUnreadRosterPlayers(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Elenco</h1>
        <p className="mt-0.5 text-xs text-muted">Jogadores, convidados e a comunidade da pelada</p>
      </div>

      <RosterDirectory
        officialPlayers={roster.officialPlayers}
        activeGuests={roster.activeGuests}
        wags={roster.wags}
        supporters={roster.supporters}
        unreadPlayerIds={unreadRoster.playerIds}
        unreadSeenThrough={unreadRoster.seenThrough}
      />
    </div>
  );
}
