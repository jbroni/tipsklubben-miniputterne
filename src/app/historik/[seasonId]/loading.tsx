export default function SeasonDetailLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* Header with back link */}
      <div className="flex items-center gap-2.5 px-0.5 py-3">
        <div className="w-6 h-6 bg-line-card rounded-sm animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-5 w-32 bg-line-card rounded-sm animate-pulse" />
          <div className="h-3 w-24 bg-line-card rounded-sm animate-pulse" />
        </div>
      </div>

      {/* Final standings card */}
      <div className="card p-3!">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-line-card rounded-sm animate-pulse" />
          ))}
        </div>
      </div>

      {/* Point progress chart */}
      <div className="card p-3!">
        <div className="space-y-4">
          {/* Header */}
          <div>
            <div className="h-5 w-40 bg-line-card rounded-sm animate-pulse" />
            <div className="h-3 w-56 bg-line-card rounded-sm animate-pulse mt-0.5" />
          </div>

          {/* Mode switch */}
          <div className="flex gap-1 rounded-card border border-line-card bg-paper p-1">
            <div className="flex-1 min-h-[44px] bg-line-card rounded-sm animate-pulse" />
            <div className="flex-1 min-h-[44px] bg-line-card rounded-sm animate-pulse" />
          </div>

          {/* Chart area */}
          <div className="h-[266px] bg-line-card rounded-sm animate-pulse" />

          {/* Standings */}
          <div className="space-y-2">
            <div className="h-4 w-16 bg-line-card rounded-sm animate-pulse" />
            <div className="flex flex-col gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="min-h-[58px] bg-line-card rounded-sm animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rounds heading */}
      <div className="px-0.5">
        <div className="h-5 w-24 bg-line-card rounded-sm animate-pulse" />
      </div>

      {/* Rounds list */}
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-line-card rounded-sm animate-pulse" />
                <div className="h-3 w-48 bg-line-card rounded-sm animate-pulse" />
              </div>
              <div className="w-6 h-5 bg-line-card rounded-sm animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
