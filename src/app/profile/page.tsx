import { FedtBadge } from "@/components/FedtBadge";
import { formatDecimal } from "@/lib/fedt";
import { requireUser } from "@/lib/auth";
import { getLeaderboardEntries } from "@/lib/leaderboard-data";

export default async function ProfilePage() {
  const [currentUser, entries] = await Promise.all([
    requireUser(),
    getLeaderboardEntries(),
  ]);

  const currentUserId = currentUser.id;
  const myEntry = entries.find((e) => e.user.id === currentUserId);
  const myRank = entries.findIndex((e) => e.user.id === currentUserId) + 1;

  if (!myEntry) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Min profil</h1>
        <p className="text-muted">
          Ingen statistik endnu. Indlevér tips i en runde for at se din profil.
        </p>
      </div>
    );
  }

  const bestRound =
    myEntry.roundScores.length > 0
      ? myEntry.roundScores.reduce((a, b) => (a.points > b.points ? a : b))
      : null;
  const worstRound =
    myEntry.roundScores.length > 0
      ? myEntry.roundScores.reduce((a, b) => (a.points < b.points ? a : b))
      : null;

  const boldestRound =
    myEntry.roundScores.length > 0
      ? myEntry.roundScores.reduce((a, b) => (a.fedt < b.fedt ? a : b))
      : null;
  const safestRound =
    myEntry.roundScores.length > 0
      ? myEntry.roundScores.reduce((a, b) => (a.fedt > b.fedt ? a : b))
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          {myEntry.user.displayName}
        </h1>
        <p className="text-muted mt-1">
          Nr. {myRank} af {entries.length}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Point i alt</p>
          <p className="font-display text-2xl font-bold text-brand mt-1">
            {myEntry.totalPoints}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Snit</p>
          <p className="font-display text-2xl font-bold text-ink mt-1">
            {formatDecimal(myEntry.avgScore, 1)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Runder spillet</p>
          <p className="font-display text-2xl font-bold text-ink mt-1">
            {myEntry.roundsPlayed}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Sæson-fedt</p>
          <div className="mt-2">
            <FedtBadge score={myEntry.seasonFedt} />
          </div>
        </div>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-2 gap-4">
        {bestRound && (
          <div className="card">
            <p className="text-xs text-muted uppercase tracking-wider">Bedste runde</p>
            <p className="font-display text-lg font-bold text-brand mt-1">
              {bestRound.points}/13
            </p>
            <p className="text-xs text-muted">Runde {bestRound.roundNumber}</p>
          </div>
        )}
        {worstRound && (
          <div className="card">
            <p className="text-xs text-muted uppercase tracking-wider">Dårligste runde</p>
            <p className="font-display text-lg font-bold text-signal mt-1">
              {worstRound.points}/13
            </p>
            <p className="text-xs text-muted">Runde {worstRound.roundNumber}</p>
          </div>
        )}
        {boldestRound && (
          <div className="card">
            <p className="text-xs text-muted uppercase tracking-wider">Mindst fedtede runde</p>
            <FedtBadge score={boldestRound.fedt} size="sm" />
            <p className="text-xs text-muted mt-1">Runde {boldestRound.roundNumber}</p>
          </div>
        )}
        {safestRound && (
          <div className="card">
            <p className="text-xs text-muted uppercase tracking-wider">Mest fedtede runde</p>
            <FedtBadge score={safestRound.fedt} size="sm" />
            <p className="text-xs text-muted mt-1">Runde {safestRound.roundNumber}</p>
          </div>
        )}
      </div>

      {/* Round history */}
      <div className="card">
        <h2 className="font-display font-semibold text-ink mb-4">Rundehistorik</h2>
        <div className="space-y-2">
          {myEntry.roundScores.map((r) => (
            <div
              key={r.roundNumber}
              className="flex items-center justify-between py-2 border-b border-line-hairline last:border-0"
            >
              <span className="text-ink-tertiary">Runde {r.roundNumber}</span>
              <div className="flex items-center gap-4">
                <span
                  className={`font-mono font-bold ${
                    r.points >= 10
                      ? "text-brand"
                      : r.points >= 7
                      ? "text-ink-secondary"
                      : "text-muted"
                  }`}
                >
                  {r.points}/13
                </span>
                <FedtBadge score={r.fedt} size="sm" showLabel={false} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
