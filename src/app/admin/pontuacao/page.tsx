import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { ScoringRulesForm } from "@/components/ScoringRulesForm";

export default async function PontuacaoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/mais"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface transition-colors hover:bg-surface-hover"
          aria-label="Voltar para Mais"
        >
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Pontuação Ranked</h1>
          <p className="mt-0.5 text-xs text-muted">Como cada resultado e evento vale pontos</p>
        </div>
      </div>

      <ScoringRulesForm />
    </div>
  );
}
