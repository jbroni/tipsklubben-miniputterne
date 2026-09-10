export default function GroupCouponLoading() {
  return (
    <div className="space-y-0">
      {/* Sticky top bar skeleton */}
      <div className="sticky top-0 z-50 bg-paper border-b border-line-card">
        <div className="max-w-[1360px] mx-auto px-7 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <div className="h-8 w-48 bg-line-card rounded animate-pulse" />
            <div className="h-4 w-40 bg-line-card rounded animate-pulse" />
          </div>
          <div className="h-6 w-16 bg-line-card rounded-full animate-pulse" />
          <div className="h-6 w-32 bg-line-card rounded-full animate-pulse" />
          <div className="h-6 w-32 bg-line-card rounded animate-pulse" />
          <div className="h-11 w-40 bg-line-card rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Member avatars skeleton */}
      <div className="max-w-[1360px] mx-auto px-7 py-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-24 bg-line-card rounded animate-pulse" />
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full bg-line-card animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Two-column grid skeleton */}
      <div className="max-w-[1360px] mx-auto px-7 py-6 grid grid-cols-[320px_1fr] gap-5">
        {/* System list skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-32 bg-line-card rounded animate-pulse mb-3" />
          {Array.from({ length: 13 }).map((_, i) => (
            <div
              key={i}
              className="p-2.5 border border-line-card rounded-lg space-y-2"
            >
              <div className="h-4 w-20 bg-line-card rounded animate-pulse" />
              <div className="flex justify-between">
                <div className="h-3 w-10 bg-line-card rounded animate-pulse" />
                <div className="h-3 w-12 bg-line-card rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Match list skeleton */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: "900px" }} className="space-y-0">
            {Array.from({ length: 13 }).map((_, i) => (
              <div
                key={i}
                className="border-b border-line-card py-3 px-4 flex items-start gap-4"
              >
                <div className="h-4 w-6 bg-line-card rounded animate-pulse" />
                <div className="w-56 space-y-2">
                  <div className="h-4 w-32 bg-line-card rounded animate-pulse" />
                  <div className="h-3 w-24 bg-line-card rounded animate-pulse" />
                  <div className="h-3 w-28 bg-line-card rounded animate-pulse" />
                </div>
                <div className="w-32 space-y-1">
                  <div className="h-4 w-full bg-line-card rounded animate-pulse" />
                  <div className="h-3 w-24 bg-line-card rounded animate-pulse" />
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div
                      key={j}
                      className="w-10 h-10 bg-line-card rounded-lg animate-pulse"
                    />
                  ))}
                </div>
                <div className="flex-1 h-3 bg-line-card rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Save button skeleton */}
      <div className="max-w-[1360px] mx-auto px-7 py-6 border-t border-line-card">
        <div className="h-11 w-40 bg-line-card rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
