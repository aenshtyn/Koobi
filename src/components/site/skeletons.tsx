export function OfferGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="cards-grid" aria-busy="true" aria-label="Loading learning offers">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-[420px]" />
      ))}
    </div>
  );
}

export function BlockSkeleton({ className = "h-40" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-busy="true" />;
}
