import { FedtContent } from "@/components/FedtContent";
import { requireUser } from "@/lib/auth";
import { getLeaderboardEntries } from "@/lib/leaderboard-data";

export default async function FedtPage() {
  await requireUser();
  const entries = await getLeaderboardEntries();

  return <FedtContent entries={entries} />;
}
