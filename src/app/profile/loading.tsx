export default function ProfileLoading() {
  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="space-y-1">
        <div className="h-8 w-48 bg-line-card rounded-sm animate-pulse" />
        <div className="h-4 w-32 bg-line-card rounded-sm animate-pulse" />
      </div>

      {/* Stats grid (4 cards in responsive layout) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card text-center space-y-2">
            <div className="h-3 w-16 bg-line-card rounded-sm animate-pulse mx-auto" />
            <div className="h-6 w-20 bg-line-card rounded-sm animate-pulse mx-auto" />
          </div>
        ))}
      </div>

      {/* Highlights grid (2x2 cards) */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-2">
            <div className="h-3 w-20 bg-line-card rounded-sm animate-pulse" />
            <div className="h-5 w-12 bg-line-card rounded-sm animate-pulse" />
            <div className="h-3 w-24 bg-line-card rounded-sm animate-pulse" />
          </div>
        ))}
      </div>

      {/* Round history card */}
      <div className="card">
        <div className="space-y-2 mb-4">
          <div className="h-5 w-32 bg-line-card rounded-sm animate-pulse" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-line-card rounded-sm animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
