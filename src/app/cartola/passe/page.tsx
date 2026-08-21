import { redirect } from "next/navigation";

// Mantém links antigos funcionando enquanto centraliza o Passe dentro do Elenco.
export default function SeasonPassPage() {
  redirect("/jogadores?tab=passe");
}
