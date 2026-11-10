"use client";
import { useEffect, useRef, useState } from "react";
import { formatKES } from "@/domain/format";
import { niceMax, shortKES, type Point } from "@/domain/earnings";

const H = 240;
const PAD = { top: 16, right: 16, bottom: 30, left: 44 };

/**
 * Earnings over time: one series, so no legend; a thin line over a soft fill, round markers, and a
 * crosshair with the exact amount on hover or keyboard focus. The same figures follow as a table.
 */
export function EarningsChart({ points, caption }: { points: Point[]; caption: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const top = niceMax(Math.max(...points.map((p) => p.value)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i * innerW) / (points.length - 1) : innerW / 2);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return null;
    return Math.min(points.length - 1, Math.max(0, Math.round((clientX - box.left - PAD.left) / step)));
  };
  const a = active === null ? null : points[active];
  const everyOther = width < 420 && points.length > 6;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrap}
        className="relative w-full min-w-0"
        style={{ height: H }}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        tabIndex={0}
        role="group"
        aria-label={`${caption}. Use the left and right arrow keys to read each point.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          else if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
          else if (e.key === "Escape") setActive(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={H} aria-hidden="true" className="absolute top-0 left-0 block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-2)" fontFamily="var(--font-mono)">
                {shortKES(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            everyOther && (points.length - 1 - i) % 2 ? null : (
              <text key={p.key} x={x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--ink-2)">
                {p.label}
              </text>
            ),
          )}
          <path d={area} fill="var(--chart-1)" opacity={0.12} />
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {a && active !== null ? <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" /> : null}
          {points.map((p, i) => (
            <circle key={p.key} cx={x(i)} cy={y(p.value)} r={active === i ? 6 : 4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
          ))}
        </svg>
        {a && active !== null ? (
          <div
            className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col rounded-[10px] border-[1.5px] border-ink bg-card px-3 py-1.5 text-center whitespace-nowrap shadow-[2px_3px_0_rgba(30,26,22,.12)]"
            style={{ left: Math.min(width - 70, Math.max(70, x(active))), top: Math.max(46, y(a.value) - 10) }}
          >
            <span className="text-[12.5px] leading-4 text-ink-2">{a.label}</span>
            <span className="mono text-[15px] leading-5 font-medium">{formatKES(a.value)}</span>
          </div>
        ) : null}
      </div>
      <details className="text-[14px]">
        <summary className="cursor-pointer text-ink-2">Show these figures as a table</summary>
        <table className="mt-2 w-full max-w-[360px] text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-ink-2">
              <th scope="col" className="py-1 font-semibold">
                Period
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Earned
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-dashed border-line-2">
                <td className="py-1">{p.label}</td>
                <td className="mono py-1 text-right">{formatKES(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
