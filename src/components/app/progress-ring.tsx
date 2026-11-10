/** A ring filled to a real share of a known total, with the count in the middle. */
export function ProgressRing({ pct, children, size = 112 }: { pct: number; children: React.ReactNode; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--sand)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--forest)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
      </svg>
      <span className="relative flex flex-col items-center text-center leading-tight">{children}</span>
    </span>
  );
}
