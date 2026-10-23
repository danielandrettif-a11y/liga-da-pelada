import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { PermanentLeagueLauncher } from "@/components/PermanentLeagueLauncher";
import { QuickLeagueLauncher } from "@/components/QuickLeagueLauncher";

const choiceCardClass = "flex min-h-[220px] flex-col rounded-3xl border border-accent/35 bg-[linear-gradient(145deg,rgba(204,255,0,.12),rgba(4,34,18,.94)_58%,rgba(3,20,12,.98))] p-4 text-left shadow-[0_18px_45px_rgba(0,0,0,.24)] transition-transform active:scale-[.98]";

export default async function CreateLeaguePage({ searchParams }: {
  searchParams: Promise<{ error?: string; quickError?: string }>;
}) {
  const { user } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby/criar");
  const { error, quickError } = await searchParams;
  return <div className="space-y-6 py-5">
    <Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link>
    <div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Nova pelada</p><h1 className="mt-2 font-athletic text-3xl font-black uppercase text-white">Escolha seu jeito de jogar</h1></div>
    <div className="grid grid-cols-2 gap-3">
      <PermanentLeagueLauncher error={error} cardClassName={choiceCardClass} />
      <QuickLeagueLauncher error={Boolean(quickError)} cardClassName={choiceCardClass} />
    </div>
  </div>;
}
