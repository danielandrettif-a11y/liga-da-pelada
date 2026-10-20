import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { PlayerForm } from "@/components/PlayerForm";

export default function NovoJogadorPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/jogadores"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Novo convidado</h1>
          <p className="text-xs text-muted mt-0.5">
            Cadastre uma participação temporária; jogadores oficiais entram pela própria conta
          </p>
        </div>
      </div>

      <PlayerForm />
    </div>
  );
}
