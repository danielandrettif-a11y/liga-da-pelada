import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CollectivePage() {
  redirect("/jogadores?view=collective");
}
