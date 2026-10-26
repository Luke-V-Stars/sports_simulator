// Grey placeholder boxes shown while data loads.

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-edge bg-surface" />
      ))}
    </div>
  );
}

export function BlockSkeleton({ height = 320, label = "Loading" }: { height?: number; label?: string }) {
  return (
    <div
      className="flex animate-pulse items-center justify-center rounded-xl border border-edge bg-surface text-sm text-muted"
      style={{ height }}
      aria-busy="true"
    >
      {label}…
    </div>
  );
}
