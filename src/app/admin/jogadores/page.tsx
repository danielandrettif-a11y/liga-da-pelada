import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayers } from "@/lib/actions/players";
import { ChevronRight, UserPlus, ArrowLeft, Shield } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerProfileBadge } from "@/components/PlayerProfileBadge";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function AdminJogadoresPage() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) redirect("/");

  const [players, { data: adminProfiles }] = await Promise.all([
    getPlayers(),
    account.client
      .from("account_profiles")
      .select("player_id")
      .eq("role", "admin")
      .not("player_id", "is", null),
  ]);
  const adminPlayerIds = new Set((adminProfiles || []).map((profile) => profile.player_id));

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link
          href="/mais"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">Gerenciar Elenco</h1>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted">
          {players.length} cadastrados
        </p>
        <Link
          href="/admin/jogadores/novo"
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-background font-bold text-sm rounded-xl transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Nova pessoa
        </Link>
      </div>

      <div className="glass-card overflow-hidden">
        {players.map((player, idx) => (
          <Link key={player.id} href={`/admin/jogadores/${player.id}/editar`}>
            <div
              className={`
                flex items-center justify-between p-4 hover:bg-surface-hover transition-colors
                ${idx < players.length - 1 ? "border-b border-border" : ""}
              `}
            >
              <div className="flex items-center gap-3">
                <PlayerAvatar
                  name={player.name}
                  avatarUrl={player.avatar_url}
                  className="w-10 h-10 rounded-full bg-surface-hover border border-border text-xs font-bold text-muted flex-shrink-0"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-bold text-foreground">{player.name}</p>
                    {adminPlayerIds.has(player.id) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/35 bg-warning/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-warning">
                        <Shield className="h-3 w-3" /> ADM
                      </span>
                    )}
                    {player.player_profile && <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />}
                    <span className="rounded-full border border-border px-2 py-0.5 text-[8px] font-black uppercase text-muted">
                      {player.member_category === "player" ? "Jogador" : player.member_category === "guest" ? (player.is_selectable ? "Convidado" : "Convidado arquivado") : player.member_category === "wag" ? "WAG" : "Torcedor"}
                    </span>
                  </div>
                  {player.nickname && (
                    <p className="text-[10px] text-muted">
                      Apelido: {player.nickname}
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted" />
            </div>
          </Link>
        ))}
        {players.length === 0 && (
          <div className="p-8 text-center text-muted text-sm">
            Nenhum jogador cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}
