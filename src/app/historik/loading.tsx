export default function HistorikLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* All-time heading */}
      <div className="px-0.5">
        <div className="h-6 w-32 bg-line-card rounded-sm animate-pulse" />
      </div>

      {/* All-time stats card */}
      <div className="card">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-line-card rounded-sm animate-pulse" />
          ))}
        </div>
      </div>

      {/* Seasons heading */}
      <div className="px-0.5 mt-5">
        <div className="h-6 w-32 bg-line-card rounded-sm animate-pulse" />
      </div>

      {/* Season cards (3 cards) */}
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-line-card rounded-sm animate-pulse" />
                <div className="h-3 w-40 bg-line-card rounded-sm animate-pulse" />
              </div>
              <div className="w-6 h-5 bg-line-card rounded-sm animate-pulse shrink-0" />
            </div>
            {/* Podium placeholders */}
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex-1 h-16 bg-line-card rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
