import { RosterDirectory } from "@/components/RosterDirectory";
import { getRosterGroups } from "@/lib/actions/players";
import { getUnreadRosterPlayers } from "@/lib/actions/registrations";

export const revalidate = 0;

export default async function JogadoresPage() {
  const [rankedRoster, friendlyRoster, unreadRoster] = await Promise.all([
    getRosterGroups("official"),
    getRosterGroups("friendly"),
    getUnreadRosterPlayers(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Elenco</h1>
        <p className="mt-0.5 text-xs text-muted">Jogadores, convidados e a comunidade da pelada</p>
      </div>

      <RosterDirectory
        officialPlayers={{ ranked: rankedRoster.officialPlayers, friendly: friendlyRoster.officialPlayers }}
        activeGuests={{ ranked: rankedRoster.activeGuests, friendly: friendlyRoster.activeGuests }}
        wags={rankedRoster.wags}
        supporters={rankedRoster.supporters}
        unreadPlayerIds={unreadRoster.playerIds}
        unreadSeenThrough={unreadRoster.seenThrough}
      />
    </div>
  );
}
