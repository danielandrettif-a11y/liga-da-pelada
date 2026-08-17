import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getStadiums } from "@/lib/actions/stadiums";
import { StadiumsManager } from "@/components/StadiumsManager";

export const revalidate = 0;

export default async function EstadiosPage() {
  const account = await getCurrentAccount();

  if (!account.isAdmin) {
    redirect("/mais");
  }

  const stadiums = await getStadiums();

  return <StadiumsManager initialStadiums={stadiums} />;
}
