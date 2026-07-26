export default function RoundDetailLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-line-card rounded animate-pulse" />
          <div className="h-6 w-48 bg-line-card rounded animate-pulse" />
        </div>
        <div className="h-5 w-16 bg-line-card rounded-full animate-pulse" />
      </div>

      {/* Scores card */}
      <div className="card space-y-3">
        <div className="h-3 w-24 bg-line-card rounded animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 w-full bg-line-card rounded animate-pulse" />
          ))}
        </div>
      </div>

      {/* Matches grid */}
      <div className="card !p-3 font-mono">
        <div className="grid gap-0.5 pb-1.5 border-b border-line-divider">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-2 bg-line-card rounded animate-pulse" />
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} className="h-6 bg-line-card rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
