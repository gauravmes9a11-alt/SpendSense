import { inr } from "./format";

export const PALETTE = ["#2DD4BF", "#60A5FA", "#A78BFA", "#FBBF24", "#FB7185", "#34D399", "#F472B6", "#94A3B8"];
export const GRID = "rgba(148,163,184,0.12)";
export const AXIS = { stroke: "rgba(148,163,184,0.25)", tick: { fill: "#94A3B8", fontSize: 12 } } as const;

export function ChartTip({ active, payload, label, money = true }: { active?: boolean; payload?: any[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-ink px-3 py-2 text-xs shadow-xl">
      {label && <div className="mb-1 text-muted">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="ml-auto pl-4 tabular-nums text-white">{money ? inr(Number(p.value), true) : p.value}</span>
        </div>
      ))}
    </div>
  );
}
