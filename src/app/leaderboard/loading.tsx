export default function LeaderboardLoading() {
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <div className="h-8 w-32 bg-line-card rounded-sm animate-pulse" />
      </div>

      {/* Leaderboard card */}
      <div className="card">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-4 bg-line-card rounded-sm animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-1/2 bg-line-card rounded-sm animate-pulse" />
              </div>
              <div className="w-12 h-4 bg-line-card rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Round-by-round breakdown card */}
      <div className="card overflow-x-auto">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-line-card rounded-sm animate-pulse mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-line-card rounded-sm animate-pulse" />
          ))}
        </div>
      </div>

      {/* Points progress chart skeleton */}
      <div className="card">
        <div className="h-4 w-40 bg-line-card rounded animate-pulse mb-4" />
        {/* Approximates the real component: 266px SVG + mode switch + standings list */}
        <div className="h-[600px] bg-line-card rounded animate-pulse" />
      </div>
    </div>
  );
}
