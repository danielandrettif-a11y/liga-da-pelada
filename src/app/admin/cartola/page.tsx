import { redirect } from "next/navigation";
import Link from "next/link";
import { FantasyAdminSettings } from "@/components/fantasy/FantasyAdminSettings";
import { getFantasyAdminData } from "@/lib/actions/fantasy";

export default async function FantasyAdminPage() {
  const data = await getFantasyAdminData(); if (!data) redirect("/mais");
  return <div className="space-y-5"><header><Link href="/mais" className="text-xs font-bold text-accent">← Voltar</Link><h1 className="mt-3 text-xl font-black text-foreground">Configurar Cartola</h1><p className="mt-1 text-xs text-muted">Pontuação, economia, valorização e correções históricas.</p></header><FantasyAdminSettings settings={data.settings} rounds={data.rounds}/></div>;
}
