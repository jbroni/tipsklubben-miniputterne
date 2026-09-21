export default function AdminLoading() {
  return (
    <div className="space-y-8">
      {/* Header with logo and admin badge */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-line-card rounded-sm animate-pulse" />
        <div className="w-12 h-5 bg-line-card rounded-full animate-pulse" />
        <div className="flex-1" />
        <div className="h-10 w-32 bg-line-card rounded-xl animate-pulse" />
      </div>

      {/* Create season button or form */}
      <div className="h-12 bg-brand rounded-xl animate-pulse" />

      {/* Seasons list (3 cards) */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-line-card rounded-sm animate-pulse" />
                <div className="h-3 w-40 bg-line-card rounded-sm animate-pulse" />
              </div>
              <div className="h-10 w-32 bg-line-card rounded-xl animate-pulse" />
            </div>

            {/* Round summary dots */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }).map((_, j) => (
                <div
                  key={j}
                  className="w-8 h-8 bg-line-card rounded-lg animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
