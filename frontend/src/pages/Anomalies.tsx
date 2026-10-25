import { useState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { useApp, type Row } from "../context";
import { useApi } from "../lib/api";
import { dateFmt, inr, pct, title } from "../lib/format";
import { Async, Badge, Card, CardHead, EmptyState, Input, Label, Lineage, Notice, PageHeader, Select, StatBand, Table, Td, Th } from "../components/ui";
import { cn } from "../lib/utils";

const sevTone = { HIGH: "rose", MEDIUM: "amber", LOW: "blue" } as const;
const statTone = { OPEN: "amber", REVIEWED: "teal", DISMISSED: "slate" } as const;

function Split({ items, tones }: { items: Row[]; tones: Record<string, string> }) {
  const total = items.reduce((a, b) => a + b.n, 0) || 1;
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">{items.map((i) => <div key={i.label} className={tones[i.label]} style={{ width: `${(i.n / total) * 100}%` }} />)}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", tones[i.label])} />{title(i.label)}: {i.n}</span>)}</div>
    </div>
  );
}

export default function Anomalies() {
  const { userId } = useApp();
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");
  const [z, setZ] = useState(1.5);
  const [minN, setMinN] = useState(4);
  const res = useApi<Row>("/api/anomalies", { user_id: userId, status, severity, anomaly_type: type });
  const dyn = useApi<Row>("/api/anomalies/dynamic", { user_id: userId, z, min_samples: minN });

  return (
    <>
      <PageHeader title="Anomaly detection" subtitle="Two clearly separate sources: flags stored in anomaly_flags, and outliers calculated on demand with SQL window functions. Only the second kind is computed when you open this page." />
      <Async s={res} rows={5}>
        {(d) => (
          <>
            <StatBand cells={[
              { label: "Stored anomaly flags", value: d.summary.total, sub: "Rows in anomaly_flags" },
              { label: "Open", value: d.summary.by_status.find((s: Row) => s.label === "OPEN")?.n ?? 0, tone: "loss" },
              { label: "Unread alerts", value: d.unread_alerts, sub: `${d.alerts.length} alerts in the alerts table`, tone: "accent" },
            ]} />
            <div className="mb-5 grid gap-5 md:grid-cols-3">
              <Card><CardHead title="By severity" /><Split items={d.summary.by_severity} tones={{ HIGH: "bg-loss", MEDIUM: "bg-warn", LOW: "bg-azure" }} /></Card>
              <Card><CardHead title="By status" /><Split items={d.summary.by_status} tones={{ OPEN: "bg-warn", REVIEWED: "bg-accent", DISMISSED: "bg-slate-500" }} /></Card>
              <Card><CardHead title="By type" /><Split items={d.summary.by_type} tones={{ UNUSUAL_SPENDING: "bg-azure", PRICE_DRIFT: "bg-loss", LOW_USAGE_HIGH_COST: "bg-warn" }} /></Card>
            </div>

            <Card className="mb-5">
              <CardHead title="Stored anomaly history" hint="Flags saved in anomaly_flags, newest first" right={<div className="flex items-center gap-2"><Badge tone="blue">Stored</Badge><Lineage from={["anomaly_flags", "transactions", "subscriptions"]} state={res} /></div>} />
              <div className="flex flex-wrap gap-3 px-5 py-3">
                <Label>Status<Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option>OPEN</option><option>REVIEWED</option><option>DISMISSED</option></Select></Label>
                <Label>Severity<Select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">All</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></Select></Label>
                <Label>Type<Select value={type} onChange={(e) => setType(e.target.value)}><option value="">All</option><option value="UNUSUAL_SPENDING">Unusual spending</option><option value="PRICE_DRIFT">Price drift</option><option value="LOW_USAGE_HIGH_COST">Low usage, high cost</option></Select></Label>
              </div>
              {d.flags.length === 0 ? <EmptyState icon={<CheckCircle2 size={20} />} title="No stored flags match" body="Nothing in anomaly_flags matches this filter." /> : (
                <Table>
                  <thead><tr><Th>Detected</Th><Th>Type</Th><Th>Severity</Th><Th>Status</Th><Th>Related to</Th><Th className="text-right">Amount</Th><Th>Reason recorded</Th></tr></thead>
                  <tbody>{d.flags.map((f: Row) => (
                    <tr key={f.anomaly_id} className="align-top hover:bg-white/[0.025]">
                      <Td className="whitespace-nowrap text-muted">{dateFmt(f.detected_at)}</Td><Td>{title(f.anomaly_type)}</Td>
                      <Td><Badge tone={sevTone[f.severity as keyof typeof sevTone]}>{title(f.severity)}</Badge></Td><Td><Badge tone={statTone[f.status as keyof typeof statTone]}>{title(f.status)}</Badge></Td>
                      <Td>{f.merchant_name ? <>{f.merchant_name}<span className="block text-xs text-muted">Transaction #{f.transaction_id}, {dateFmt(f.transaction_date)}</span></> : f.subscription_name ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{f.amount != null ? inr(f.amount, true) : f.current_price != null ? <span title="Current subscription price">{inr(f.current_price, true)}<span className="block text-xs text-muted">subscription price</span></span> : "—"}</Td>
                      <Td className="max-w-md text-slate-300">{f.explanation}</Td>
                    </tr>))}</tbody>
                </Table>
              )}
            </Card>

            <Card className="mb-5">
              <CardHead title="Alerts" hint="From the alerts table" right={<Lineage from={["alerts"]} state={res} />} />
              {d.alerts.length === 0 ? <EmptyState icon={<BellRing size={20} />} title="No alerts" /> : (
                <ul className="divide-y divide-line/60">{d.alerts.map((a: Row) => (
                  <li key={a.alert_id} className="flex items-start gap-3 px-5 py-3">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.is_read ? "bg-slate-600" : "bg-accent")} aria-label={a.is_read ? "Read" : "Unread"} />
                    <div><p className="text-sm font-medium text-white">{a.alert_title}</p><p className="text-sm text-muted">{a.alert_message}</p><p className="mt-0.5 text-xs text-slate-500">{dateFmt(a.created_at)}</p></div>
                  </li>))}</ul>
              )}
            </Card>
          </>
        )}
      </Async>

      <Card>
        <CardHead title="Calculated now: statistical outliers" hint="Not stored. Nothing here has been written to anomaly_flags." right={<div className="flex items-center gap-2"><Badge tone="amber">Calculated at query time</Badge><Lineage from={["transactions", "categories"]} state={dyn} /></div>} />
        <div className="flex flex-wrap items-end gap-3 px-5 py-3">
          <Label>Minimum z-score<Input type="number" step="0.1" min={0.5} max={5} value={z} onChange={(e) => setZ(Math.min(5, Math.max(0.5, Number(e.target.value) || 1.5)))} className="w-28" /></Label>
          <Label>Minimum samples per category<Input type="number" min={3} max={100} value={minN} onChange={(e) => setMinN(Math.min(100, Math.max(3, Number(e.target.value) || 4)))} className="w-28" /></Label>
        </div>
        <Async s={dyn} rows={4}>
          {(d) => (
            <>
              <p className="px-5 pb-3 text-xs text-muted">{d.method}</p>
              {d.outliers.length === 0 ? <EmptyState title="No outliers at this threshold" body="Lower the minimum z-score or the sample size to see more candidates." /> : (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Merchant</Th><Th>Category</Th><Th className="text-right">Amount</Th><Th className="text-right">Category average</Th><Th className="text-right">Z-score</Th><Th className="text-right">Percent rank</Th><Th className="text-right">Samples</Th></tr></thead>
                  <tbody>{d.outliers.map((o: Row) => (
                    <tr key={o.transaction_id} className="hover:bg-white/[0.025]">
                      <Td className="whitespace-nowrap text-muted">{dateFmt(o.transaction_date)}</Td><Td className="font-medium text-white">{o.merchant_name}</Td><Td>{o.category_name}</Td>
                      <Td className="text-right tabular-nums">{inr(o.amount, true)}</Td><Td className="text-right tabular-nums text-muted">{inr(o.category_mean, true)}</Td>
                      <Td className="text-right tabular-nums"><Badge tone={o.z_score > 0 ? "rose" : "blue"}>{o.z_score > 0 ? "+" : ""}{o.z_score}</Badge></Td>
                      <Td className="text-right tabular-nums">{pct(o.pct_rank * 100)}</Td><Td className="text-right tabular-nums">{o.sample_size}</Td>
                    </tr>))}</tbody>
                </Table>
              )}
              <div className="mt-4 border-t border-line">
                <CardHead title="Subscription charge changes" hint="LAG() over each subscription's monthly charges; only months where the charge differs" />
                {d.charge_changes.length === 0 ? <EmptyState title="No charge changes" /> : (
                  <Table>
                    <thead><tr><Th>Subscription</Th><Th>Billing month</Th><Th className="text-right">Previous</Th><Th className="text-right">This month</Th><Th className="text-right">Change</Th></tr></thead>
                    <tbody>{d.charge_changes.map((c: Row, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.025]"><Td className="font-medium text-white">{c.subscription_name}</Td><Td>{c.billing_month}</Td>
                        <Td className="text-right tabular-nums text-muted">{inr(c.previous_charge, true)}</Td><Td className="text-right tabular-nums">{inr(c.month_charge, true)}</Td>
                        <Td className="text-right"><Badge tone={c.change_amount > 0 ? "rose" : "teal"}>{pct(c.change_pct)}</Badge></Td></tr>))}</tbody>
                  </Table>
                )}
              </div>
            </>
          )}
        </Async>
      </Card>
      {!res.error && <div className="mt-5"><Notice tone="blue" title="How to read this page">Stored flags are facts recorded in the database. Calculated outliers are a view of the current data under the thresholds you set, and disappear when you change them.</Notice></div>}
    </>
  );
}
