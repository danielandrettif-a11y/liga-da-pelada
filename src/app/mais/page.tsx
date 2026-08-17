import Link from "next/link";
import { FinishSeasonCard } from "@/components/FinishSeasonCard";
import { getAccountDisplayName, getCurrentAccount } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { InstallAppEntry } from "@/components/InstallAppPrompt";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";
import { CallupAdminCard } from "@/components/CallupAdminCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getActiveCallup } from "@/lib/actions/callups";
import { getLeagueConfig } from "@/lib/actions/league";
import { PreSeasonToggle } from "@/components/PreSeasonToggle";
import {
  UserPlus,
  CalendarPlus,
  Shield,
  ChevronRight,
  Sliders,
  UserRound,
  LogIn,
  LogOut,
  Football,
  ArrowLeftRight,
  ClipboardList,
  ShieldCheck,
  Stadium,
} from "@/components/icons";
import { getStadiums } from "@/lib/actions/stadiums";

const ADMIN_SECTIONS = [
  {
    title: "Gerenciar",
    items: [
      {
        href: "/admin/jogadores",
        icon: UserPlus,
        label: "Elenco",
        description: "Cadastrar e classificar pessoas",
      },
      {
        href: "/mais/estadios",
        icon: Stadium,
        label: "Campos e Estádios",
        description: "Cadastrar locais e links do Google Maps",
      },
      {
        href: "/admin/prelistas",
        icon: CalendarPlus,
        label: "Pré-listas e Rodadas",
        description: "Preparar datas, jogadores e montar times",
      },
      {
        href: "/admin/transfermarket",
        icon: ArrowLeftRight,
        label: "Histórico do Transfermarket",
        description: "Ver quem marcou cada pagamento",
      },
      {
        href: "/admin/cadastros",
        icon: ClipboardList,
        label: "Histórico de Cadastros",
        description: "Ver quem entrou no elenco",
      },
      {
        href: "/admin/administradores",
        icon: ShieldCheck,
        label: "Administradores",
        description: "Promover e revisar acessos de ADM",
      },
    ],
  },
  {
    title: "Configurações",
    items: [
      {
        href: "/admin/pontuacao",
        icon: Sliders,
        label: "Pontuação",
        description: "Configurar regras de pontuação",
      },
      {
        href: "/admin/cartola",
        icon: ClipboardList,
        label: "Cartola",
        description: "Configurar Fantasy, preços e reprocessamentos",
      },
      {
        href: "/admin/liga",
        icon: Shield,
        label: "Liga",
        description: "Configurações da liga",
      },
    ],
  },
];

export default async function MaisPage() {
  const account = await getCurrentAccount();
  const playerAvatarPromise = account.profile?.player_id
    ? account.client
        .from("players")
        .select("avatar_url")
        .eq("id", account.profile.player_id)
        .maybeSingle()
        .then(({ data }) => data?.avatar_url)
    : Promise.resolve(undefined);
  const [accountName, activeCallup, leagueConfig, playerAvatarUrl, stadiums] = await Promise.all([
    getAccountDisplayName(account),
    account.isAdmin ? getActiveCallup() : Promise.resolve(null),
    account.isAdmin ? getLeagueConfig() : Promise.resolve(null),
    playerAvatarPromise,
    account.isAdmin ? getStadiums() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Mais</h1>

      {account.user && (
        <div className="glass-card flex items-center gap-3 p-4">
          <PlayerAvatar
            name={accountName || "Usuário"}
            avatarUrl={playerAvatarUrl}
            className="h-11 w-11 shrink-0 rounded-full border border-accent/25 bg-accent/15 text-sm font-black text-accent"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Conta conectada</p>
            <p className="truncate text-base font-black text-foreground">{accountName}</p>
            <p className="truncate text-xs text-muted">{account.user.email}</p>
          </div>
          <span className="rounded-full bg-accent/10 px-2 py-1 text-[9px] font-black uppercase text-accent">
            {account.isAdmin ? "ADM" : "Jogador"}
          </span>
        </div>
      )}

      {account.user && account.profile?.player_id && (
        <div>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 px-1">Minha conta</h2>
          <div className="glass-card overflow-hidden">
            <Link href="/meu-perfil" className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface"><UserRound className="h-5 w-5 text-accent" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Meu Perfil</p>
                <p className="text-xs text-muted">Foto, nome e estilo de jogo</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          </div>
        </div>
      )}

      {account.user && (
        <InstallAppEntry userId={account.user.id} />
      )}

      {account.user && <PushNotificationSettings />}

      {account.isAdmin && (
        <CallupAdminCard
          callup={activeCallup}
          stadiums={stadiums}
          playersPerTeam={leagueConfig?.players_per_team || 5}
          teamsPerRound={leagueConfig?.teams_per_round || 3}
        />
      )}

      {account.isAdmin && leagueConfig && (
        <PreSeasonToggle
          leagueId={leagueConfig.id}
          initialEnabled={leagueConfig.preseason_enabled === true}
        />
      )}

      {account.isAdmin && ADMIN_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 px-1">
            {section.title}
          </h2>
          <div className="glass-card overflow-hidden">
            {section.items.map((item, index) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={`
                    flex items-center gap-3 px-4 py-3.5
                    ${index < section.items.length - 1 ? "border-b border-border" : ""}
                    hover:bg-surface-hover transition-colors
                  `}
                >
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {item.label}
                    </p>
                    <p className="text-xs text-muted">{item.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {account.isAdmin && <FinishSeasonCard />}

      {account.user ? (
        <form action={logout}>
          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-bold text-muted hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sair da conta
          </button>
        </form>
      ) : (
        <Link href="/login" className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 py-3 text-sm font-bold text-accent">
          <LogIn className="h-4 w-4" /> Entrar ou criar conta
        </Link>
      )}

      {/* Version info */}
      <div className="text-center pt-4 pb-2">
        <p className="text-xs text-muted/50">Pelada de Baixa Qualidade v0.1.0</p>
        <p className="text-[10px] text-muted/30 mt-0.5">
          Feito com <Football className="mx-1 inline h-3.5 w-3.5" /> para peladas entre amigos
        </p>
      </div>
    </div>
  );
}
