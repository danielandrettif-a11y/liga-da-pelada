import { RosterDirectory } from "@/components/RosterDirectory";
import { getRosterGroups } from "@/lib/actions/players";
import { getUnreadRosterPlayers } from "@/lib/actions/registrations";
import { getSeasonPassDashboard } from "@/lib/actions/fantasy";
import { getMyCosmeticsDashboard } from "@/lib/actions/cosmetics";
import { SeasonPassExperience } from "@/components/fantasy/SeasonPassExperience";

export const revalidate = 0;

export default async function JogadoresPage({ searchParams }: PageProps<"/jogadores">) {
  const { tab, reward } = await searchParams;
  const shouldLoadPass = tab === "passe" || typeof reward === "string";
  const passDataRequest = shouldLoadPass
    ? Promise.all([getSeasonPassDashboard(), getMyCosmeticsDashboard()]).then(([pass, cosmetics]) => ({ pass, cosmetics }))
    : Promise.resolve(null);
  const [rankedRoster, friendlyRoster, unreadRoster, passData] = await Promise.all([
    getRosterGroups("official"),
    getRosterGroups("friendly"),
    getUnreadRosterPlayers(),
    passDataRequest,
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
        initialView={shouldLoadPass ? "pass" : "roster"}
        seasonPassProgress={passData?.pass.progress}
        seasonPassMaxProgress={passData?.pass.maxProgress}
        seasonPass={passData ? <SeasonPassExperience pass={passData.pass} cosmetics={passData.cosmetics} rewardId={typeof reward === "string" ? reward : undefined} /> : undefined}
      />
    </div>
  );
}
