import { FedtContent } from "@/components/FedtContent";
import { requireUser } from "@/lib/auth";
import { getLeaderboardEntries } from "@/lib/leaderboard-data";
import { withShortName } from "@/lib/display-name";
import { getShortNames } from "@/lib/display-name-data";

export default async function FedtPage() {
  await requireUser();
  const [allEntries, shortNames] = await Promise.all([
    getLeaderboardEntries(),
    getShortNames(),
  ]);

  const entries = allEntries.map((e) => ({
    ...e,
    user: withShortName(e.user, shortNames),
  }));

  return <FedtContent entries={entries} />;
}
