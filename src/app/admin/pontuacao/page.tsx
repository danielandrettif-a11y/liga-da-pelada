import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { ScoringRulesForm } from "@/components/ScoringRulesForm";
import { getBQScoringRules } from "@/lib/actions/bq-scoring";
import { getCurrentAccount } from "@/lib/auth";

export default async function PontuacaoPage() {
  const account = await getCurrentAccount();
  const rules = await getBQScoringRules();

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
          <h1 className="text-xl font-bold text-foreground">Pontuação BQ v5</h1>
          <p className="mt-0.5 text-xs text-muted">Scouts básicos canônicos da Ranked e Cartola</p>
        </div>
      </div>

      <ScoringRulesForm initialValues={rules} isAdmin={account.isAdmin} />
    </div>
  );
}
