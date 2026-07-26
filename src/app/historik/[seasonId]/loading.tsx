export default function SeasonDetailLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* Header with back link */}
      <div className="flex items-center gap-2.5 px-0.5 py-3">
        <div className="w-6 h-6 bg-line-card rounded animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-5 w-32 bg-line-card rounded animate-pulse" />
          <div className="h-3 w-24 bg-line-card rounded animate-pulse" />
        </div>
      </div>

      {/* Final standings card */}
      <div className="card !p-3">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-line-card rounded animate-pulse" />
          ))}
        </div>
      </div>

      {/* Rounds heading */}
      <div className="px-0.5">
        <div className="h-5 w-24 bg-line-card rounded animate-pulse" />
      </div>

      {/* Rounds list */}
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-line-card rounded animate-pulse" />
                <div className="h-3 w-48 bg-line-card rounded animate-pulse" />
              </div>
              <div className="w-6 h-5 bg-line-card rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
