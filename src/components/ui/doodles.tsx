/** Chora drawn elements. Decorative only: aria-hidden, marketing pages only (BRAND §9). */
import type { CSSProperties } from "react";

type P = { className?: string; style?: CSSProperties };

export function Spark({ className = "spark", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 24.5l10 2.6" />
      <path d="M10.5 9.5l8 9.3" />
      <path d="M25 4.5l.8 11.5" />
    </svg>
  );
}

export function CurvedArrow({ className = "carrow", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 32" aria-hidden="true">
      <path d="M46 22C36 26 20 24 7 14" />
      <path d="M16 15.4 7 14 10.6 22.5" />
    </svg>
  );
}

export function StepArrow({ className = "step-arrow", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 60 30" aria-hidden="true">
      <path d="M4 21c10-12 30-16 48-6" />
      <path d="M43.5 8.5l9 6.5-9.6 4.2" />
    </svg>
  );
}

export function CircleArrow({ className = "carr", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2.3c5.3.4 9 4.8 8.7 10-.3 5.4-4.8 9.4-10.1 9.2C6.3 21.3 2.4 17 2.6 11.7 2.8 6.6 6.8 2.6 12 2.4c.9 0 1.9.2 2.6.5" />
      <path d="M8 12h8" />
      <path d="m12 16 4-4-4-4" />
    </svg>
  );
}

export function Tick({ className = "tk", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 10.8c1.5 1 2.7 2.4 3.7 4.2 2.3-4.8 5.3-8.4 9.3-10.8" />
    </svg>
  );
}

export function Bulb({ className = "bulb dood hide-sm", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 52 70" aria-hidden="true">
      <path className="gl" d="M26 14c-9.5 0-15.5 7-15 15 .4 6.5 5 9.6 7.2 15.2h15.8c2.2-5.6 6.8-8.7 7.2-15.2.5-8-5.7-15-15.2-15z" />
      <path className="gl" d="M19.5 50h13M20.5 55.5h11M23 61h6" />
      <path className="gl" d="M21.5 38c1-5 3-7 4.5-7s3.5 2 4.5 7" />
      <path className="ry" d="M26 2.5v6M8 9l4 4M44 9l-4 4M2.5 28h5M44.5 28h5" />
    </svg>
  );
}

export function Plant({ className = "plant dood hide-sm", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 120 210" aria-hidden="true">
      <path className="stem" d="M60 152C57 120 64 88 58 30" />
      <path className="lf" d="M59 132Q34 140 12 118Q36 104 59 132Z" />
      <path className="rib" d="M56 129Q36 122 20 119" />
      <path className="lf" d="M61 120Q88 130 108 104Q82 94 61 120Z" />
      <path className="rib" d="M64 117Q84 110 100 106" />
      <path className="lf" d="M60 98Q30 102 18 72Q46 70 60 98Z" />
      <path className="rib" d="M57 95Q40 86 26 76" />
      <path className="lf" d="M61 84Q92 84 100 54Q70 54 61 84Z" />
      <path className="rib" d="M64 81Q80 70 94 58" />
      <path className="lf" d="M59 60Q36 58 32 30Q54 34 59 60Z" />
      <path className="rib" d="M57 56Q48 46 37 35" />
      <path className="lf" d="M58 34Q50 16 64 2Q74 20 58 34Z" />
      <path className="rib" d="M59 30Q61 18 63 8" />
      <path className="pot" d="M28 147L92 146L91 159L29 160Z" />
      <path className="pot" d="M33 160L87 159L80 206L40 206Z" />
      <path className="band" d="M38 177Q60 172 83 175" />
    </svg>
  );
}

export function StarIcon({ className = "star", style }: P) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}
