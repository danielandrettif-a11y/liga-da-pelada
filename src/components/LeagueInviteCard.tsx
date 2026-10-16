import { getCurrentAccount } from "@/lib/auth";
import { getSelectedLeague } from "@/lib/league-context";
import { Check, ShieldCheck, UserPlus, Users, X } from "@/components/icons";
import { reviewAccess } from "@/app/lobby/actions";
import { CopyLeagueInvite } from "./CopyLeagueInvite";

export async function LeagueInviteCard({
  variant = "compact",
  returnTo = "/convocacao",
  error = false,
}: {
  variant?: "compact" | "hero";
  returnTo?: "/" | "/convocacao";
  error?: boolean;
}) {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.isAdmin || !league || league.role !== "admin") return null;
  const [{ data: token }, { data: requests }] = await Promise.all([
    account.client.rpc("get_league_invite", { p_league_id: league.id }),
    account.client
      .from("league_join_requests")
      .select("id, user_id, requested_at")
      .eq("league_id", league.id)
      .eq("status", "pending")
      .order("requested_at"),
  ]);
  if (!token) return null;
  const { data: applicants } = requests?.length
    ? await account.client
      .from("account_profiles")
      .select("user_id, account_tag")
      .in("user_id", requests.map((request) => request.user_id))
    : { data: [] };
  const applicantByUserId = new Map((applicants || []).map((item) => [item.user_id, item.account_tag]));

  const requestList = requests?.length ? (
    <div className="space-y-2">
      {(requests || []).map((request) => (
        <div key={request.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <UserPlus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-white">{applicantByUserId.get(request.user_id) || "Nova conta"}</p>
            <p className="text-[10px] text-muted">Quer entrar nesta pelada</p>
          </div>
          <form action={reviewAccess}>
            <input type="hidden" name="request_id" value={request.id} />
            <input type="hidden" name="decision" value="approve" />
            <input type="hidden" name="return_to" value={returnTo} />
            <button type="submit" aria-label={`Aprovar ${applicantByUserId.get(request.user_id) || "pedido"}`} className="flex size-9 items-center justify-center rounded-lg bg-accent text-background">
              <Check className="size-4" />
            </button>
          </form>
          <form action={reviewAccess}>
            <input type="hidden" name="request_id" value={request.id} />
            <input type="hidden" name="decision" value="reject" />
            <input type="hidden" name="return_to" value={returnTo} />
            <button type="submit" aria-label={`Recusar ${applicantByUserId.get(request.user_id) || "pedido"}`} className="flex size-9 items-center justify-center rounded-lg border border-danger/35 text-danger">
              <X className="size-4" />
            </button>
          </form>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted">
      <ShieldCheck className="size-4 shrink-0 text-accent" />
      Nenhum pedido aguardando aprovação.
    </div>
  );

  if (variant === "hero") {
    return (
      <article className="flex min-h-[360px] h-full flex-col overflow-hidden rounded-[2rem] border border-accent/30 bg-[#07150d] p-5 shadow-xl sm:min-h-[380px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Users className="size-6" />
          </span>
          <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-black uppercase text-accent">
            Área do ADM
          </span>
        </div>

        <div className="mt-5">
          <p className="text-xs font-black uppercase text-accent">Traga sua turma</p>
          <h2 className="mt-1 text-balance font-athletic text-3xl font-black uppercase italic leading-none text-white sm:text-4xl">
            Convide para {league.name}
          </h2>
          <p className="mt-3 max-w-sm text-pretty text-sm leading-5 text-muted">
            Copie o link para chamar jogadores. Em peladas fechadas, os pedidos aparecem abaixo para aprovação.
          </p>
        </div>

        <div className="mt-4">
          <CopyLeagueInvite token={token} name={league.name} fullWidth />
          {error && <p role="alert" className="mt-2 text-xs font-bold text-danger">Não foi possível revisar o pedido. Tente novamente.</p>}
        </div>

        <div className="mt-auto pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase text-white">Pedidos de entrada</p>
            <span className="tabular-nums text-xs font-black text-accent">{requests?.length || 0}</span>
          </div>
          <div className="max-h-32 overflow-y-auto overscroll-contain pr-1">{requestList}</div>
        </div>
      </article>
    );
  }

  return <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
    <p className="text-sm font-bold text-white">Convide para {league.name}</p>
    <p className="mb-3 mt-1 text-pretty text-xs text-muted">Copie o link e aprove os pedidos de entrada sem sair desta página.</p>
    <CopyLeagueInvite token={token} name={league.name} />
    <div className="mt-3">{requestList}</div>
  </div>;
}
