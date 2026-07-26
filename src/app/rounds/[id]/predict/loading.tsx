export default function PredictLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-line-card rounded animate-pulse" />
          <div className="h-6 w-48 bg-line-card rounded animate-pulse" />
        </div>
      </div>

      {/* Match rows (13 matches) */}
      {Array.from({ length: 13 }).map((_, i) => (
        <div key={i} className="card space-y-2">
          <div className="h-4 w-3/4 bg-line-card rounded animate-pulse" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="flex-1 h-10 bg-line-card rounded-[9px] animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}

      {/* Submit button */}
      <div className="h-12 bg-brand rounded-xl animate-pulse" />
    </div>
  );
}
