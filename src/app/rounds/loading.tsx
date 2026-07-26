export default function RoundsLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="h-6 w-20 bg-line-card rounded animate-pulse" />
        <div className="h-5 w-40 bg-line-card rounded-full animate-pulse" />
      </div>

      {/* Round cards (5 skeleton cards) */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-line-card rounded-card px-4 py-3.5 shadow-card"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-line-card rounded animate-pulse" />
                <div className="h-4 w-full bg-line-card rounded animate-pulse" />
              </div>
              <div className="w-6 h-5 bg-line-card rounded animate-pulse shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
