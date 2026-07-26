export default function DashboardLoading() {
  const SkeletonBar = () => (
    <div className="h-3 bg-line-card rounded animate-pulse" />
  );

  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* Header */}
      <div className="flex items-baseline justify-between px-0.5">
        <div className="h-6 w-32 bg-line-card rounded animate-pulse" />
        <div className="h-5 w-24 bg-line-card rounded-full animate-pulse" />
      </div>

      {/* Hero card */}
      <div className="card space-y-3">
        <div className="h-4 w-16 bg-line-card rounded animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-3/4 bg-line-card rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-line-card rounded animate-pulse" />
        </div>
        <div className="h-10 w-full bg-line-card rounded-lg animate-pulse" />
      </div>

      {/* Sidebar items (3 cards) */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card space-y-2">
          <div className="h-3 w-20 bg-line-card rounded animate-pulse" />
          <div className="h-5 w-3/4 bg-line-card rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
