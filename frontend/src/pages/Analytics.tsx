import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, type Row } from "../context";
import { useApi } from "../lib/api";
import { dateFmt, inr, inrCompact, monthFmt, pct, title } from "../lib/format";
import { AXIS, ChartTip, GRID, PALETTE } from "../lib/charts";
import { Async, Badge, Button, Card, CardHead, EmptyState, Input, Label, Lineage, PageHeader, Select, Table, Td, Th } from "../components/ui";

export default function Analytics() {
  const { userId, meta } = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const res = useApi<Row>("/api/analytics/spending", { user_id: userId, category_id: category, date_from: from, date_to: to });
  const bad = !!from && !!to && from > to;

  return (
    <>
      <PageHeader title="Spending analytics" subtitle="Aggregations run in MySQL (GROUP BY, LAG, moving average windows). Every chart below responds to the filters." />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Label>From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Label>
          <Label>To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Label>
          <Label>Category<Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{meta?.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}</Select></Label>
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setCategory(""); }}>Clear</Button>
          {bad && <p className="pb-2 text-sm text-warn">The start date is after the end date.</p>}
        </div>
      </Card>
      <Async s={res} rows={8}>
        {(d) => (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHead title="Monthly expenditure" hint="Expenses with a 3-month moving average (AVG over a window of 3 rows)" right={<Lineage from={["transactions"]} state={res} />} />
              {d.monthly.length === 0 ? <EmptyState title="No data in this range" /> : (
                <div className="h-72 px-2 pb-3 pt-4"><ResponsiveContainer><ComposedChart data={d.monthly.map((r: Row) => ({ ...r, label: monthFmt(r.month) }))} margin={{ left: 4, right: 16 }}>
                  <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="label" {...AXIS} tickLine={false} /><YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={56} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="expense" name="Expenses" fill="#2DD4BF" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
                  <Line dataKey="moving_avg_3m" name="3-month average" stroke="#60A5FA" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart></ResponsiveContainer></div>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <CardHead title="Month-over-month change" hint="Computed with LAG(expense) over month" />
              <Table>
                <thead><tr><Th>Month</Th><Th className="text-right">Expenses</Th><Th className="text-right">Previous month</Th><Th className="text-right">Change</Th><Th className="text-right">Income</Th><Th className="text-right">Transactions</Th></tr></thead>
                <tbody>{d.monthly.map((r: Row) => (
                  <tr key={r.month} className="hover:bg-white/[0.025]">
                    <Td className="font-medium text-white">{monthFmt(r.month)}</Td><Td className="text-right tabular-nums">{inr(r.expense, true)}</Td>
                    <Td className="text-right tabular-nums text-muted">{r.previous_expense == null ? "—" : inr(r.previous_expense, true)}</Td>
                    <Td className="text-right">{r.mom_pct == null ? <span className="text-muted">First month</span> : <Badge tone={r.mom_pct > 0 ? "rose" : r.mom_pct < 0 ? "teal" : "slate"}>{pct(r.mom_pct)}</Badge>}</Td>
                    <Td className="text-right tabular-nums">{inr(r.income, true)}</Td><Td className="text-right tabular-nums">{r.tx_count}</Td>
                  </tr>))}</tbody>
              </Table>
            </Card>

            <Card>
              <CardHead title="Category comparison" hint="Total expense per category" right={<Lineage from={["transactions", "categories"]} state={res} />} />
              {d.by_category.length === 0 ? <EmptyState title="No expenses" /> : (
                <div className="h-64 px-2 pb-3 pt-3"><ResponsiveContainer><BarChart data={d.by_category} margin={{ left: 4, right: 16 }}>
                  <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="category_name" {...AXIS} tickLine={false} /><YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={56} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]}>{d.by_category.map((_: Row, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
                </BarChart></ResponsiveContainer></div>
              )}
            </Card>

            <Card>
              <CardHead title="Merchant ranking" hint="Top 15 by expense" right={<Lineage from={["transactions", "merchants"]} state={res} />} />
              {d.by_merchant.length === 0 ? <EmptyState title="No merchants" /> : (
                <div className="px-5 py-3">{d.by_merchant.map((m: Row, i: number) => {
                  const max = d.by_merchant[0].total || 1;
                  return (
                    <div key={m.merchant_name} className="py-1.5">
                      <div className="flex items-baseline justify-between text-sm"><span className="text-slate-200">{i + 1}. {m.merchant_name}</span><span className="tabular-nums text-muted">{inr(m.total, true)} <span className="text-xs">({m.tx_count} tx)</span></span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-azure" style={{ width: `${(m.total / max) * 100}%` }} /></div>
                    </div>);
                })}</div>
              )}
            </Card>

            <Card>
              <CardHead title="By transaction type" hint="Income and expense totals" right={<Lineage from={["transactions"]} state={res} />} />
              {d.by_type.length === 0 ? <EmptyState title="No transactions" /> : (
                <div className="h-60 px-2 pb-3"><ResponsiveContainer><PieChart>
                  <Pie data={d.by_type.map((t: Row) => ({ ...t, name: title(t.transaction_type) }))} dataKey="total" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3} stroke="none">
                    {d.by_type.map((t: Row, i: number) => <Cell key={i} fill={t.transaction_type === "INCOME" ? "#2DD4BF" : "#FB7185"} />)}
                  </Pie><Tooltip content={<ChartTip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart></ResponsiveContainer></div>
              )}
            </Card>

            <Card>
              <CardHead title="Subscription-linked versus other spending" hint={d.recurring_note} right={<Lineage from={["transactions"]} state={res} />} />
              {d.recurring_split.length === 0 ? <EmptyState title="No expenses" /> : (
                <div className="h-60 px-2 pb-3 pt-3"><ResponsiveContainer><BarChart data={d.recurring_split.map((r: Row) => ({ ...r, label: monthFmt(r.month) }))} margin={{ left: 4, right: 16 }}>
                  <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="label" {...AXIS} tickLine={false} /><YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={56} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="subscription_linked" name="Subscription-linked" stackId="a" fill="#A78BFA" /><Bar dataKey="other" name="Other" stackId="a" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                </BarChart></ResponsiveContainer></div>
              )}
            </Card>
          </div>
        )}
      </Async>
    </>
  );
}
