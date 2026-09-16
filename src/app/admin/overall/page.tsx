import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { OverallShadowPanel } from "@/components/OverallShadowPanel";
import { getOverallShadowAdminData } from "@/lib/actions/overall";
import { getCurrentAccount } from "@/lib/auth";

export default async function OverallAdminPage() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) redirect("/");
  const data = await getOverallShadowAdminData();
  if (!data) redirect("/");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface transition-colors hover:bg-surface-hover" aria-label="Voltar para Mais">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div><h1 className="text-xl font-black text-foreground">OVR adaptativo</h1><p className="mt-0.5 text-xs text-muted">Auditoria segura antes de publicar qualquer nota.</p></div>
      </div>
      <OverallShadowPanel initialData={data} />
    </div>
  );
}
