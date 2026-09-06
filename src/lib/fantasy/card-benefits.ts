export type FantasyCardBenefitKind =
  | "points"
  | "budget_credit"
  | "discount"
  | "budget_recovery"
  | "pending"
  | "none";

export type FantasyCardBenefit = {
  kind: FantasyCardBenefitKind;
  amount: number;
  unit: "pts" | "currency" | "percent" | "none";
  applied: boolean;
  label: string;
  description: string | null;
};

type CardBenefitInput = {
  slug?: string | null;
  status?: string | null;
  bonus?: number | null;
  details?: Record<string, unknown> | null;
  fallbackBonus?: number | null;
  fallbackDescription?: string | null;
};

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: number) {
  return `C$ ${value.toFixed(2).replace(".", ",")}`;
}

export function resolveFantasyCardBenefit(input: CardBenefitInput): FantasyCardBenefit {
  const details = input.details || {};
  const description = typeof details.description === "string"
    ? details.description
    : input.fallbackDescription || null;
  const status = (input.status || "").toUpperCase();
  if (["RESERVED", "LOCKED"].includes(status)) {
    return { kind: "pending", amount: 0, unit: "none", applied: false, label: "Em disputa", description };
  }

  const recovery = numeric(details.budgetRecovery);
  if (recovery > 0) {
    return { kind: "budget_recovery", amount: recovery, unit: "currency", applied: true, label: `+${currency(recovery)}`, description };
  }

  const discountAmount = numeric(details.discountAmount);
  const discountPercent = numeric(details.discountPercent);
  if (input.slug === "bargain" || discountAmount > 0 || discountPercent > 0) {
    const applied = discountAmount > 0 || discountPercent > 0;
    const label = discountAmount > 0 ? `${currency(discountAmount)} economizados` : `${discountPercent.toFixed(0)}% de desconto`;
    return { kind: "discount", amount: discountAmount || discountPercent, unit: discountAmount > 0 ? "currency" : "percent", applied, label, description };
  }

  const budgetBonus = numeric(details.budgetBonus);
  if (input.slug === "extra_credit" || budgetBonus > 0) {
    const amount = budgetBonus || 5;
    return { kind: "budget_credit", amount, unit: "currency", applied: true, label: `+${currency(amount)} temporários`, description };
  }

  const points = Math.max(numeric(input.bonus), numeric(input.fallbackBonus));
  if (points > 0) {
    return { kind: "points", amount: points, unit: "pts", applied: true, label: `+${points.toFixed(1)} pts`, description };
  }

  return { kind: "none", amount: 0, unit: "none", applied: false, label: "Sem benefício", description };
}
