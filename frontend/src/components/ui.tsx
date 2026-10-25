import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Database, Inbox, RefreshCw, X } from "lucide-react";
import { cn } from "../lib/utils";
import { autoCell, inr, num, title } from "../lib/format";
import type { ApiState } from "../lib/api";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-line bg-panel shadow-card", className)}>{children}</section>;
}

/** Small provenance chip: which tables fed this panel and how long MySQL took. */
export function Lineage({ from, state }: { from: string[]; state?: { ms: number | null; queries: number | null } }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink/60 px-2 py-1 text-xs text-muted"
      title={state?.ms != null ? `${state.queries} quer${state.queries === 1 ? "y" : "ies"} measured on the server` : "Source tables and views"}
    >
      <Database size={12} className="text-accent" aria-hidden />
      {from.join(", ")}
      {state?.ms != null && <span className="tabular-nums text-accent/90">{state.ms.toFixed(1)} ms</span>}
    </span>
  );
}

export function CardHead({ title: t, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div>
        <h3 className="text-[15px] font-semibold text-white">{t}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ title: t, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{t}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "teal" | "blue" | "amber" | "rose" | "slate";
const tones: Record<Tone, string> = {
  teal: "bg-accent/12 text-accent ring-accent/25",
  blue: "bg-azure/12 text-azure ring-azure/25",
  amber: "bg-warn/12 text-warn ring-warn/25",
  rose: "bg-loss/12 text-loss ring-loss/25",
  slate: "bg-slate-400/10 text-slate-300 ring-slate-400/20",
};
export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

export function Button({ variant = "outline", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }) {
  const v = {
    primary: "bg-accent text-ink hover:bg-accent/90 font-semibold",
    outline: "border border-line bg-lift/60 text-slate-200 hover:bg-lift hover:border-slate-500/40",
    ghost: "text-muted hover:bg-white/5 hover:text-white",
  }[variant];
  return <button {...p} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50", v, className)} />;
}

const field = "rounded-lg border border-line bg-ink/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 hover:border-slate-500/40 focus:border-accent/60 focus:outline-none";
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(field, className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn(field, "pr-8", className)}>{children}</select>;
}
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("flex flex-col gap-1 text-xs text-muted", className)}>{children}</label>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-line bg-ink/60 p-0.5">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", value === o.value ? "bg-lift text-white shadow-glow" : "text-muted hover:text-white")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/5", className)} />;
}
export function Loading({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5 p-5", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-5" />)}
    </div>
  );
}
export function ErrorState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div role="alert" className="m-5 flex items-start gap-3 rounded-lg border border-loss/30 bg-loss/8 p-4 text-sm">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-loss" />
      <div>
        <p className="font-medium text-rose-200">{message}</p>
        <p className="mt-1 text-xs text-muted">{hint ?? "Use the refresh button in the top bar to retry. Technical details are in the backend log."}</p>
      </div>
    </div>
  );
}
export function EmptyState({ title: t, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rounded-full border border-line bg-lift/60 p-3 text-muted">{icon ?? <Inbox size={20} />}</div>
      <p className="font-medium text-slate-200">{t}</p>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
    </div>
  );
}
export function Notice({ tone = "amber", title: t, children }: { tone?: "amber" | "blue"; title: string; children?: ReactNode }) {
  const c = tone === "amber" ? "border-warn/30 bg-warn/8 text-warn" : "border-azure/30 bg-azure/8 text-azure";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-4 text-sm", c)}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div><p className="font-medium">{t}</p>{children && <div className="mt-1 text-xs text-slate-300">{children}</div>}</div>
    </div>
  );
}

/** Renders loading / error, then the content once data exists. */
export function Async<T>({ s, rows, children }: { s: ApiState<T>; rows?: number; children: (data: T) => ReactNode }) {
  if (s.error) return <ErrorState message={s.error} />;
  if (!s.data) return <Loading rows={rows} />;
  return <>{children(s.data)}</>;
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-sm">{children}</table></div>;
}
export const Th = ({ children, className, onClick, active, dir }: { children?: ReactNode; className?: string; onClick?: () => void; active?: boolean; dir?: "asc" | "desc" }) => (
  <th scope="col" className={cn("whitespace-nowrap border-b border-line px-4 py-2.5 text-left text-xs font-medium text-muted", className)}>
    {onClick ? (
      <button onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-white", active && "text-accent")}>
        {children}<span aria-hidden className="text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    ) : children}
  </th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn("border-b border-line/60 px-4 py-2.5 align-middle", className)}>{children}</td>
);

/** Generic table for any rows. Column names are used as formatting hints. */
export function AutoTable({ columns, rows, raw = false, hide = [] }: { columns: string[]; rows: Record<string, any>[]; raw?: boolean; hide?: string[] }) {
  const cols = columns.filter((c) => !hide.includes(c));
  return (
    <Table>
      <thead><tr>{cols.map((c) => <Th key={c}>{raw ? c : title(c)}</Th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><Td colSpan={cols.length} className="py-8 text-center text-muted">No rows.</Td></tr>}
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-white/[0.025]">
            {cols.map((c) => (
              <Td key={c} className={cn(typeof r[c] === "number" && "text-right tabular-nums", r[c] == null && "text-slate-600")}>{autoCell(c, r[c], raw)}</Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <span>{num(total)} result{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="px-2 py-1" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
        <span className="tabular-nums">Page {page} of {totalPages}</span>
        <Button variant="outline" className="px-2 py-1" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
      </div>
    </div>
  );
}

/** Side panel for record details. */
export function Sheet({ open, onClose, title: t, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t}>
      <button className="absolute inset-0 bg-black/55" onClick={onClose} aria-label="Close panel" />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-white">{t}</h3>
          <Button variant="ghost" className="p-1.5" onClick={onClose} aria-label="Close"><X size={18} /></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/60 py-2.5 text-sm">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-slate-100">{v ?? "—"}</dd>
    </div>
  );
}

export type StatCell = { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "accent" | "loss" };
/** One connected strip of figures (hairline dividers) instead of a row of identical cards. */
export function StatBand({ cells }: { cells: StatCell[] }) {
  const odd = cells.length % 2 === 1;
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-flow-col lg:auto-cols-fr">
        {cells.map((c, i) => (
          <div key={i} className={cn("bg-panel px-5 py-4", odd && i === cells.length - 1 && "col-span-2 lg:col-span-1")}>
            <p className="text-xs text-muted">{c.label}</p>
            <p className={cn("mt-1 font-display text-2xl font-semibold tracking-tight", c.tone === "accent" ? "text-accent" : c.tone === "loss" ? "text-loss" : "text-white")}>{c.value}</p>
            {c.sub && <p className="mt-1 text-xs text-muted">{c.sub}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export const Money = ({ v, decimals }: { v: number | null | undefined; decimals?: boolean }) => <span className="tabular-nums">{inr(v, decimals)}</span>;
export const SpinIcon = ({ spinning }: { spinning: boolean }) => <RefreshCw size={16} className={cn(spinning && "animate-spin")} />;
