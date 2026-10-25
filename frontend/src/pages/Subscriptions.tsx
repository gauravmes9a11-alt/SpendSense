import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { useApp, type Row } from "../context";
import { useApi } from "../lib/api";
import { dateFmt, inr, num, pct, title } from "../lib/format";
import { AXIS, ChartTip, GRID, PALETTE } from "../lib/charts";
import { Async, Badge, Card, CardHead, EmptyState, Input, Label, Lineage, Notice, PageHeader, Segmented, Select, StatBand, Table, Td, Th } from "../components/ui";

type Tab = "inventory" | "unused" | "prices";
const statusTone = { ACTIVE: "teal", PAUSED: "amber", CANCELLED: "slate" } as const;

export default function Subscriptions() {
  const [tab, setTab] = useState<Tab>("inventory");
  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Monthly figures are estimates: weekly × 52 ÷ 12, quarterly ÷ 3, yearly ÷ 12. Only rows in the subscriptions table count; merchant transactions are never assumed to be subscriptions."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: "inventory", label: "Inventory" }, { value: "unused", label: "Unused" }, { value: "prices", label: "Price changes" }]} />} />
      {tab === "inventory" && <Inventory />}
      {tab === "unused" && <Unused />}
      {tab === "prices" && <Prices />}
    </>
  );
}

function Inventory() {
  const { userId } = useApp();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const res = useApi<Row>("/api/subscriptions", { user_id: userId, status });
  return (
    <Async s={res} rows={6}>
      {(d) => {
        const s = d.summary;
        const items: Row[] = d.items.filter((i: Row) => !search || `${i.subscription_name} ${i.merchant_name}`.toLowerCase().includes(search.toLowerCase()));
        return (
          <>
            <StatBand cells={[
              { label: "Estimated monthly cost", value: inr(s.monthly_estimate), sub: "Active subscriptions, estimate", tone: "accent" },
              { label: "Estimated annual cost", value: inr(s.annual_estimate), sub: "Monthly estimate × 12" },
              { label: "Active subscriptions", value: num(s.active_count) },
            ]} />
            {s.active_count > 0 && (
              <div className="mb-5 grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHead title="Monthly cost by category" hint="Estimate, active subscriptions" right={<Lineage from={["subscriptions", "categories"]} state={res} />} />
                  <div className="h-60 px-2 pb-3 pt-3"><ResponsiveContainer><BarChart data={s.by_category} margin={{ left: 4, right: 16 }}>
                    <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="category_name" {...AXIS} tickLine={false} /><YAxis {...AXIS} tickLine={false} axisLine={false} width={56} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="monthly" name="Per month" radius={[4, 4, 0, 0]}>{s.by_category.map((_: Row, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
                  </BarChart></ResponsiveContainer></div>
                </Card>
                <Card>
                  <CardHead title="Highest-cost subscriptions" hint="Estimated monthly cost" right={<Lineage from={["subscriptions"]} state={res} />} />
                  <div className="h-60 px-2 pb-3 pt-3"><ResponsiveContainer><BarChart data={s.top} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...AXIS} tickLine={false} /><YAxis type="category" dataKey="subscription_name" {...AXIS} tickLine={false} axisLine={false} width={120} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} /><Bar dataKey="monthly" name="Per month" fill="#60A5FA" radius={[0, 4, 4, 0]} />
                  </BarChart></ResponsiveContainer></div>
                </Card>
              </div>
            )}
            <Card>
              <CardHead title="All subscriptions" right={<Lineage from={["subscriptions", "merchants", "usage_logs"]} state={res} />} />
              <div className="flex flex-wrap items-end gap-3 px-5 py-3">
                <Label className="min-w-[14rem]">Search<div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <Input className="w-full pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or merchant" /></div></Label>
                <Label>Status<Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>ACTIVE</option><option>PAUSED</option><option>CANCELLED</option></Select></Label>
              </div>
              {items.length === 0 ? <EmptyState title="No subscriptions found" body="Nothing matches this filter." /> : (
                <Table>
                  <thead><tr><Th>Subscription</Th><Th>Merchant</Th><Th className="text-right">Price</Th><Th>Billing cycle</Th><Th className="text-right">Monthly (est.)</Th><Th>Started</Th><Th>Status</Th><Th>Last used</Th></tr></thead>
                  <tbody>{items.map((i) => (
                    <tr key={i.subscription_id} className="hover:bg-white/[0.025]">
                      <Td className="font-medium text-white">{i.subscription_name}</Td><Td>{i.merchant_name}</Td>
                      <Td className="text-right tabular-nums">{inr(i.current_price, true)}</Td><Td>{title(i.billing_cycle)}</Td>
                      <Td className="text-right tabular-nums text-accent">{inr(i.monthly_estimate, true)}</Td>
                      <Td className="whitespace-nowrap text-muted">{dateFmt(i.started_on)}</Td>
                      <Td><Badge tone={statusTone[i.status as keyof typeof statusTone]}>{title(i.status)}</Badge></Td>
                      <Td className="whitespace-nowrap text-muted">{dateFmt(i.last_used_on)}{i.last_logged_use && i.last_logged_use !== i.last_used_on && <span className="block text-xs">Latest usage log: {dateFmt(i.last_logged_use)}</span>}</Td>
                    </tr>))}</tbody>
                </Table>
              )}
            </Card>
          </>
        );
      }}
    </Async>
  );
}

function Unused() {
  const { userId } = useApp();
  const [days, setDays] = useState(30);
  const [asOf, setAsOf] = useState("");
  const res = useApi<Row>("/api/subscriptions/unused", { user_id: userId, days, as_of: asOf });
  return (
    <Async s={res} rows={5}>
      {(d) => (
        <>
          {d.source === "live_query" ? (
            <div className="mb-4"><Notice tone="blue" title={`View ${d.view} not found: calculated live instead`}>
              These rows come from a live query over subscriptions and usage_logs using the rule below. Create the view from database/optional_views.sql to have MySQL own the rule.</Notice></div>
          ) : (
            <div className="mb-4"><Notice tone="blue" title={`Rows come from the view ${d.view}`}>The view defines its own threshold, so the controls below are ignored.</Notice></div>
          )}
          <StatBand cells={[
            { label: "Flagged subscriptions", value: d.items.length },
            { label: "Potential monthly savings (estimate)", value: inr(d.potential_monthly_savings), tone: "accent", sub: "If every flagged subscription were cancelled" },
            { label: "Potential annual savings (estimate)", value: inr(d.potential_annual_savings) },
          ]} />
          <Card>
            <CardHead title="Subscriptions with no recent use" hint={d.source === "live_query" ? `Active, with no recorded use or last use more than ${d.threshold_days} days before ${dateFmt(d.as_of)}` : undefined}
              right={<Lineage from={[d.source === "view" ? d.view : "subscriptions", "usage_logs"]} state={res} />} />
            <div className="flex flex-wrap items-end gap-3 px-5 py-3">
              <Label>Days without use<Input type="number" min={1} max={365} value={days} disabled={d.source === "view"} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))} className="w-28" /></Label>
              <Label>Reference date<Input type="date" value={asOf} disabled={d.source === "view"} onChange={(e) => setAsOf(e.target.value)} /></Label>
              <p className="pb-2 text-xs text-muted">Leave the date empty to use today.</p>
            </div>
            {d.items.length === 0 ? <EmptyState title="No unused subscriptions" body="Every active subscription has recent recorded use." /> : (
              <Table>
                <thead><tr><Th>Subscription</Th><Th>Last used</Th><Th className="text-right">Days since use</Th><Th className="text-right">Monthly (est.)</Th><Th>Why it was flagged</Th></tr></thead>
                <tbody>{d.items.map((i: Row, k: number) => (
                  <tr key={k} className="hover:bg-white/[0.025]">
                    <Td className="font-medium text-white">{i.subscription_name ?? "—"}</Td><Td className="whitespace-nowrap">{i.last_used ? dateFmt(i.last_used) : "Never recorded"}</Td>
                    <Td className="text-right tabular-nums">{i.days_since ?? "—"}</Td><Td className="text-right tabular-nums text-accent">{inr(i.monthly_estimate, true)}</Td>
                    <Td className="max-w-sm text-muted">{i.reason}</Td>
                  </tr>))}</tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </Async>
  );
}

function Prices() {
  const { userId } = useApp();
  const res = useApi<Row>("/api/subscriptions/price-changes", { user_id: userId });
  return (
    <Async s={res} rows={5}>
      {(d) => !d.available ? (
        <Notice title="Price history cannot be analysed">{d.message}</Notice>
      ) : (
        <>
          <StatBand cells={[{ label: "Recorded changes", value: d.items.length }, { label: "Increases", value: d.increases, tone: "loss" }, { label: "Decreases", value: d.decreases, tone: "accent" }]} />
          <Card>
            <CardHead title="Price history" hint="Percent change = (new − old) ÷ old" right={<Lineage from={["subscription_price_history", "subscriptions"]} state={res} />} />
            {d.items.length === 0 ? <EmptyState title="No price changes recorded" body="subscription_price_history has no rows for this selection. Nothing is inferred." /> : (
              <Table>
                <thead><tr><Th>Subscription</Th><Th>Changed on</Th><Th className="text-right">Old price</Th><Th className="text-right">New price</Th><Th className="text-right">Difference</Th><Th className="text-right">Change</Th><Th>Source</Th></tr></thead>
                <tbody>{d.items.map((i: Row) => (
                  <tr key={i.price_history_id} className="hover:bg-white/[0.025]">
                    <Td className="font-medium text-white">{i.subscription_name}</Td><Td className="whitespace-nowrap">{dateFmt(i.changed_at)}</Td>
                    <Td className="text-right tabular-nums">{inr(i.old_price, true)}</Td><Td className="text-right tabular-nums">{inr(i.new_price, true)}</Td>
                    <Td className="text-right tabular-nums">{inr(i.difference, true)}</Td>
                    <Td className="text-right"><Badge tone={i.direction === "INCREASE" ? "rose" : i.direction === "DECREASE" ? "teal" : "slate"}>{i.direction === "INCREASE" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{pct(i.percent_change)}</Badge></Td>
                    <Td className="text-muted">{title(i.change_source)}</Td>
                  </tr>))}</tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </Async>
  );
}
