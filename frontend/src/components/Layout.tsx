import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Activity, BarChart3, CreditCard, Database, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Receipt, Repeat, Settings, ShieldAlert, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useApp, type HealthState } from "../context";
import { Select, SpinIcon } from "./ui";

export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/recurring", label: "Recurring Payments", icon: Repeat },
  { to: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/analytics", label: "Spending Analytics", icon: BarChart3 },
  { to: "/anomalies", label: "Anomaly Detection", icon: ShieldAlert },
  { to: "/explorer", label: "Database Explorer", icon: Database },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2DD4BF" /><stop offset="1" stopColor="#60A5FA" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <path d="M7 21l6-6 4 4 8-9" stroke="#0B1120" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS: Record<HealthState, { label: string; dot: string; text: string }> = {
  checking: { label: "Checking", dot: "bg-slate-400", text: "text-muted" },
  connected: { label: "Connected", dot: "bg-accent", text: "text-accent" },
  disconnected: { label: "Disconnected", dot: "bg-warn", text: "text-warn" },
  error: { label: "Error", dot: "bg-loss", text: "text-loss" },
};

function ConnectionPill() {
  const { health } = useApp();
  const s = STATUS[health.state];
  const detail = health.state === "connected" ? `MySQL ${health.version ?? ""} · database ${health.database ?? ""}` : health.message ?? "";
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs" title={detail} role="status" aria-live="polite">
      <span className={cn("h-2 w-2 rounded-full", s.dot, health.state === "connected" && "shadow-[0_0_8px_#2DD4BF]")} />
      <span className={cn("font-medium", s.text)}>{s.label}</span>
      <span className="hidden text-muted md:inline">{health.state === "connected" ? health.database : "MySQL"}</span>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { refresh, refreshing, meta, userId, setUserId, health } = useApp();
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.title = `${current?.label ?? "SpendSense"} · SpendSense`;
  }, [current]);

  const sidebar = (compact: boolean) => (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <div className={cn("mb-4 flex items-center gap-3 px-2 py-2", compact && "justify-center px-0")}>
        <Logo />
        {!compact && (
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold text-white">SpendSense</p>
            <p className="text-[11px] text-muted">Spending and subscriptions</p>
          </div>
        )}
      </div>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/"} title={compact ? label : undefined}
          className={({ isActive }) => cn("group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", compact && "justify-center px-0",
            isActive ? "bg-accent/12 text-accent shadow-glow" : "text-muted hover:bg-white/5 hover:text-white")}>
          <Icon size={18} aria-hidden />
          {!compact && <span>{label}</span>}
          {compact && <span className="sr-only">{label}</span>}
        </NavLink>
      ))}
      <div className="mt-auto hidden lg:block">
        <button onClick={() => setCollapsed((c) => !c)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-white", compact && "justify-center px-0")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!compact && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-line bg-ink/80 backdrop-blur transition-[width] duration-200 lg:block", collapsed ? "w-[72px]" : "w-64")}>
        {sidebar(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 border-r border-line bg-ink">{sidebar(false)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink/85 px-4 py-3 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Open menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2.5 lg:hidden"><Logo size={26} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold text-white">{current?.label ?? "SpendSense"}</h1>
          </div>
          {meta && meta.users.length > 0 && (
            <Select aria-label="Show data for" value={userId ?? ""} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : undefined)} className="hidden max-w-[11rem] py-1.5 sm:block">
              <option value="">All users</option>
              {meta.users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
            </Select>
          )}
          <ConnectionPill />
          <button onClick={refresh} className="rounded-lg border border-line bg-panel p-2 text-muted hover:text-white" aria-label="Refresh data" title="Refresh data">
            <SpinIcon spinning={refreshing} />
          </button>
        </header>

        {health.state !== "connected" && health.state !== "checking" && (
          <div role="alert" className="flex items-start gap-3 border-b border-warn/25 bg-warn/8 px-4 py-2.5 text-sm text-warn md:px-6">
            <Activity size={16} className="mt-0.5 shrink-0" />
            <span>{health.message ?? "The database is not reachable."} Pages below will show errors until the connection is restored.</span>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
