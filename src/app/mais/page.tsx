import Link from "next/link";
import { FinishSeasonCard } from "@/components/FinishSeasonCard";
import { getCurrentAccount, getCurrentAccountIdentity } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { InstallAppEntry } from "@/components/InstallAppPrompt";
import { CallupAdminCard } from "@/components/CallupAdminCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getActiveCallups } from "@/lib/actions/callups";
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
  Bell,
  RotateCcw,
  Microphone,
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
      {
        href: "/mais/pix",
        icon: ArrowLeftRight,
        label: "PIX de recebimento",
        description: "Cadastrar chaves para encerrar a rodada",
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
        href: "/mais/coletivas",
        icon: Microphone,
        label: "Última coletiva",
        description: "Consultar o chat arquivado da rodada anterior",
      },
      {
        href: "/admin/overall",
        icon: Sliders,
        label: "OVR adaptativo",
        description: "Calcular e auditar notas em modo sombra",
      },
      {
        href: "/admin/cartola",
        icon: ClipboardList,
        label: "Cartola",
        description: "Configurar Fantasy, preços e reprocessamentos",
      },
      {
        href: "/admin/reprocessar",
        icon: RotateCcw,
        label: "Reprocessar temporada",
        description: "Auditar e recalcular o Cartola da temporada ativa",
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

type MaisPageProps = {
  searchParams: Promise<{ aba?: string | string[] }>;
};

export default async function MaisPage({ searchParams }: MaisPageProps) {
  const account = await getCurrentAccount();
  const params = await searchParams;
  const requestedTab = Array.isArray(params.aba) ? params.aba[0] : params.aba;
  const activeTab = account.isAdmin && requestedTab === "admin" ? "admin" : "geral";
  const [identity, activeCallups, leagueConfig, stadiums] = await Promise.all([
    getCurrentAccountIdentity(),
    account.isAdmin ? getActiveCallups() : Promise.resolve([]),
    account.isAdmin ? getLeagueConfig() : Promise.resolve(null),
    account.isAdmin ? getStadiums() : Promise.resolve([]),
  ]);
  const accountName = identity.displayName;
  const playerAvatarUrl = identity.avatarUrl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mais</h1>
        <p className="mt-1 text-xs text-muted">
          {activeTab === "admin" ? "Ferramentas de organização e configuração da pelada." : "Sua conta, preferências e outros recursos do app."}
        </p>
      </div>

      {account.isAdmin && (
        <nav className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface/80 p-1.5 shadow-lg shadow-black/10" aria-label="Áreas da aba Mais">
          <Link
            href="/mais"
            aria-current={activeTab === "geral" ? "page" : undefined}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black transition-colors ${
              activeTab === "geral" ? "bg-accent text-background shadow-[0_0_18px_rgba(204,255,0,.18)]" : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            <UserRound className="h-4 w-4" /> Minha área
          </Link>
          <Link
            href="/mais?aba=admin"
            aria-current={activeTab === "admin" ? "page" : undefined}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black transition-colors ${
              activeTab === "admin" ? "bg-warning text-background shadow-[0_0_18px_rgba(234,179,8,.18)]" : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-4 w-4" /> Administração
          </Link>
        </nav>
      )}

      {activeTab === "geral" ? (
        <>
          <Link href="/bq-manager" className="glass-card flex items-center gap-3 border border-accent/25 p-4 hover:bg-surface-hover">
            <Football className="h-8 w-8 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">BQ Manager <span className="ml-1 text-[10px] text-accent">PRÉVIA</span></p>
              <p className="mt-1 text-xs text-muted">Seu clube, cartas BQ e uma nova carreira de técnico</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>

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

          {account.user && (
            <div>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Minha conta</h2>
              <div className="glass-card overflow-hidden">
                {account.profile?.player_id && <Link href="/meu-perfil" className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface"><UserRound className="h-5 w-5 text-accent" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Meu Perfil</p>
                    <p className="text-xs text-muted">Foto, nome e estilo de jogo</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Link>}
                <Link href="/mais/notificacoes" className={`flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover ${account.profile?.player_id ? "border-t border-border" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface"><Bell className="h-5 w-5 text-accent" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Preferências de notificações</p>
                    <p className="text-xs text-muted">Partidas, Cartola e lembretes por e-mail</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Link>
              </div>
            </div>
          )}

          {account.user && <InstallAppEntry userId={account.user.id} />}

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

          <div className="pb-2 pt-4 text-center">
            <p className="text-xs text-muted/50">Pelada de Baixa Qualidade v0.1.0</p>
            <p className="mt-0.5 text-[10px] text-muted/30">
              Feito com <Football className="mx-1 inline h-3.5 w-3.5" /> para peladas entre amigos
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-warning/25 bg-[linear-gradient(135deg,rgba(234,179,8,.12),rgba(5,25,14,.88))] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/10">
                <ShieldCheck className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Central do administrador</p>
                <p className="mt-0.5 text-xs text-muted">Tudo que altera elenco, rodadas, regras e configurações fica concentrado aqui.</p>
              </div>
            </div>
          </div>

          <CallupAdminCard
            callups={activeCallups}
            stadiums={stadiums}
            playersPerTeam={leagueConfig?.players_per_team || 5}
            teamsPerRound={leagueConfig?.teams_per_round || 3}
          />

          {leagueConfig && (
            <PreSeasonToggle
              leagueId={leagueConfig.id}
              initialEnabled={leagueConfig.preseason_enabled === true}
            />
          )}

          {ADMIN_SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">
                {section.title}
              </h2>
              <div className="glass-card overflow-hidden">
                {section.items.map((item, index) => (
                  <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover ${index < section.items.length - 1 ? "border-b border-border" : ""}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface">
                      <item.icon className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-xs text-muted">{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <FinishSeasonCard />
        </>
      )}
    </div>
  );
}
