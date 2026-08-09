import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { ScoringRulesForm } from "@/components/ScoringRulesForm";
import { getScoringRules } from "@/lib/actions/scoring";

export default async function PontuacaoPage() {
  const result = await getScoringRules();

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
          <h1 className="text-xl font-bold text-foreground">Pontuação</h1>
          <p className="mt-0.5 text-xs text-muted">Defina quanto vale cada resultado</p>
        </div>
      </div>

      <ScoringRulesForm
        initialRules={result.rules}
        initialError={result.success ? undefined : result.error}
      />
    </div>
  );
}
