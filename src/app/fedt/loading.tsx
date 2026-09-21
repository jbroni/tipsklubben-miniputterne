export default function FedtLoading() {
  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="space-y-2">
        <div className="h-8 w-40 bg-line-card rounded-sm animate-pulse" />
        <div className="h-4 w-48 bg-line-card rounded-sm animate-pulse" />
      </div>

      {/* Highlight cards (2 cards) */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card text-center space-y-2">
            <div className="h-3 w-16 bg-line-card rounded-sm animate-pulse mx-auto" />
            <div className="h-5 w-24 bg-line-card rounded-sm animate-pulse mx-auto" />
            <div className="h-6 w-12 bg-line-card rounded-sm animate-pulse mx-auto" />
          </div>
        ))}
      </div>

      {/* Sort buttons */}
      <div className="flex gap-2">
        <div className="h-8 flex-1 bg-line-card rounded-lg animate-pulse" />
        <div className="h-8 flex-1 bg-line-card rounded-lg animate-pulse" />
      </div>

      {/* Fedt rankings list */}
      <div className="card">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-3 border-b border-line-hairline last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-6 h-4 bg-line-card rounded-sm animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-1/2 bg-line-card rounded-sm animate-pulse" />
                  <div className="h-3 w-1/3 bg-line-card rounded-sm animate-pulse" />
                </div>
                <div className="w-32 h-2 bg-line-card rounded-full animate-pulse" />
                <div className="w-12 h-4 bg-line-card rounded-sm animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Round-by-round Fedt table */}
      <div className="card overflow-x-auto">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-line-card rounded-sm animate-pulse mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-line-card rounded-sm animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
