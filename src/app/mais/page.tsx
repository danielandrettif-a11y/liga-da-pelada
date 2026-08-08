import Link from "next/link";
import { FinishSeasonCard } from "@/components/FinishSeasonCard";
import { createClient } from "@/lib/supabase/server";
import {
  UserPlus,
  CalendarPlus,
  Settings,
  Shield,
  ChevronRight,
  Database,
  Sliders,
} from "lucide-react";

const ADMIN_SECTIONS = [
  {
    title: "Gerenciar",
    items: [
      {
        href: "/admin/jogadores",
        icon: UserPlus,
        label: "Jogadores",
        description: "Cadastrar e editar jogadores",
      },
      {
        href: "/admin/rodada",
        icon: CalendarPlus,
        label: "Nova Rodada",
        description: "Criar rodada e montar times",
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
        href: "/admin/liga",
        icon: Shield,
        label: "Liga",
        description: "Configurações da liga",
      },
    ],
  },
  {
    title: "Dados",
    items: [
      {
        href: "/admin/banco",
        icon: Database,
        label: "Banco de Dados",
        description: "Conexão Supabase e migrações",
      },
    ],
  },
];

export default async function MaisPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Mais</h1>

      {ADMIN_SECTIONS.map((section) => (
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

      {user && <FinishSeasonCard />}

      {/* Version info */}
      <div className="text-center pt-4 pb-2">
        <p className="text-xs text-muted/50">Pelada de Baixa Qualidade v0.1.0</p>
        <p className="text-[10px] text-muted/30 mt-0.5">
          Feito com ⚽ para peladas entre amigos
        </p>
      </div>
    </div>
  );
}
