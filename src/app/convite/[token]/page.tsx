import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth";
import { getMyLeagues } from "@/lib/league-context";
import { requestAccess } from "@/app/lobby/actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { token } = await params;
  const { sent, error } = await searchParams;
  const { client, user } = await getCurrentAccount();
  const { data: invite } = await client.rpc("lookup_league_invite", { p_token: token });
  const league = invite?.[0];
  if (!league) return <div className="py-12 text-center"><h1 className="text-2xl font-bold">Convite inválido</h1><Link href="/lobby" className="mt-4 inline-block text-accent">Voltar ao lobby</Link></div>;
  const isMember = user && (await getMyLeagues()).some((item) => item.id === league.league_id);
  return <div className="mx-auto max-w-sm py-12 text-center">
    <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Convite para pelada</p>
    <h1 className="mt-3 font-athletic text-3xl font-black uppercase text-white">{league.league_name}</h1>
    <p className="mt-3 text-sm text-muted">O administrador precisa aprovar sua entrada antes de você ver os dados da pelada.</p>
    {error && <p role="alert" className="mt-5 text-sm text-red-300">Não foi possível enviar o pedido. Confira seu perfil e tente novamente.</p>}
    {sent ? <p role="status" className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-accent">Pedido enviado. Aguarde a aprovação do administrador.</p>
      : isMember ? <Link href="/lobby" className="mt-6 inline-block rounded-xl bg-accent px-5 py-3 font-bold text-black">Abrir lobby</Link>
      : user ? <form action={requestAccess} className="mt-6"><input type="hidden" name="token" value={token} /><button type="submit" className="w-full rounded-xl bg-accent px-5 py-3 font-bold text-black">Pedir entrada</button></form>
      : <Link href={`/login?next=${encodeURIComponent(`/convite/${token}`)}`} className="mt-6 inline-block rounded-xl bg-accent px-5 py-3 font-bold text-black">Entrar para pedir acesso</Link>}
  </div>;
}
