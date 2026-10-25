import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowUpRight, Search, Wallet } from "lucide-react";
import { useApp, type Row } from "../context";
import { useApi, useDebounced } from "../lib/api";
import { inr, inrCompact, monthFmt, dateFmt, num } from "../lib/format";
import { AXIS, ChartTip, GRID, PALETTE } from "../lib/charts";
import { Async, Badge, Card, CardHead, EmptyState, Input, Lineage, PageHeader, StatBand, Table, Td, Th } from "../components/ui";

export default function Overview() {
  const { userId } = useApp();
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const sum = useApi<Row>("/api/dashboard/summary", { user_id: userId });
  const monthly = useApi<{ items: Row[] }>("/api/dashboard/monthly-spending", { user_id: userId });
  const cats = useApi<{ items: Row[] }>("/api/dashboard/category-spending", { user_id: userId });
  const merchants = useApi<{ items: Row[] }>("/api/dashboard/top-merchants", { user_id: userId });
  const recent = useApi<{ items: Row[]; total: number }>("/api/transactions", { user_id: userId, q, page_size: 8, sort: "date", order: "desc" });

  const empty = sum.data && sum.data.total_transactions === 0;

  return (
    <>
      <PageHeader title="Where your money went" subtitle="Every figure on this page is calculated from the spendsense MySQL database. Amounts are in INR." right={<Lineage from={["transactions", "subscriptions", "anomaly_flags"]} state={sum} />} />

      <Async s={sum} rows={3}>
        {(d) => (
          <StatBand
            cells={[
              { label: "Total recorded expenses", value: inr(d.total_expenses), sub: `Income recorded: ${inr(d.total_income)}`, tone: "loss" },
              { label: "Total transactions", value: num(d.total_transactions), sub: "Income and expense records" },
              { label: "Active subscriptions", value: num(d.active_subscriptions), sub: "Status is ACTIVE" },
              { label: "Detected anomalies", value: num(d.total_anomalies), sub: `${d.open_anomalies} still open (stored flags)` },
              { label: "Monthly recurring (estimate)", value: inr(d.monthly_recurring_estimate), sub: "Active subscriptions, normalised to a month", tone: "accent" },
            ]}
          />
        )}
      </Async>

      {empty ? (
        <Card><EmptyState icon={<Wallet size={20} />} title="No transactions yet" body="The transactions table has no rows for this selection. Add records in MySQL and press refresh." /></Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHead title="Monthly spending trend" hint="Expenses per month" right={<Lineage from={["transactions"]} state={monthly} />} />
              <Async s={monthly} rows={6}>
                {(d) => d.items.length === 0 ? <EmptyState title="No monthly data" /> : (
                  <div className="h-72 px-2 pb-3 pt-4">
                    <ResponsiveContainer>
                      <AreaChart data={d.items.map((r) => ({ ...r, label: monthFmt(r.month) }))} margin={{ left: 4, right: 16, top: 8 }}>
                        <defs><linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.4} /><stop offset="100%" stopColor="#2DD4BF" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" {...AXIS} tickLine={false} />
                        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={56} />
                        <Tooltip content={<ChartTip />} cursor={{ stroke: "rgba(45,212,191,0.4)" }} />
                        <Area type="monotone" dataKey="expense" name="Expenses" stroke="#2DD4BF" strokeWidth={2.5} fill="url(#gExp)" dot={{ r: 3, fill: "#2DD4BF" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Async>
            </Card>

            <Card className="lg:col-span-2">
              <CardHead title="Spending by category" hint="Share of total expenses" right={<Lineage from={["transactions", "categories"]} state={cats} />} />
              <Async s={cats} rows={6}>
                {(d) => d.items.length === 0 ? <EmptyState title="No expenses to break down" /> : (
                  <div className="h-72 px-2 pb-3">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={d.items} dataKey="total" nameKey="category_name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
                          {d.items.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip content={<ChartTip />} />
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Async>
            </Card>

            <Card className="lg:col-span-3">
              <CardHead title="Expenses versus income" hint="Per month, from transaction_type" right={<Lineage from={["transactions"]} state={monthly} />} />
              <Async s={monthly} rows={5}>
                {(d) => (
                  <div className="h-64 px-2 pb-3 pt-4">
                    <ResponsiveContainer>
                      <BarChart data={d.items.map((r) => ({ ...r, label: monthFmt(r.month) }))} margin={{ left: 4, right: 16 }} barGap={4}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" {...AXIS} tickLine={false} />
                        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={56} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="expense" name="Expenses" fill="#FB7185" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="income" name="Income" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Async>
            </Card>

            <Card className="lg:col-span-2">
              <CardHead title="Top merchants" hint="By total expense" right={<Lineage from={["transactions", "merchants"]} state={merchants} />} />
              <Async s={merchants} rows={5}>
                {(d) => d.items.length === 0 ? <EmptyState title="No merchant spending" /> : (
                  <div className="h-64 px-2 pb-3 pt-3">
                    <ResponsiveContainer>
                      <BarChart data={d.items} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid stroke={GRID} horizontal={false} />
                        <XAxis type="number" {...AXIS} tickLine={false} tickFormatter={inrCompact} />
                        <YAxis type="category" dataKey="merchant_name" {...AXIS} tickLine={false} axisLine={false} width={96} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Bar dataKey="total" name="Spent" fill="#60A5FA" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Async>
            </Card>
          </div>

          <Card className="mt-5">
            <CardHead title="Recent activity" hint="Latest transactions; search by merchant or description"
              right={<div className="flex items-center gap-3"><Lineage from={["transactions", "merchants", "categories"]} state={recent} /><Link to="/transactions" className="text-sm text-accent hover:underline">All transactions</Link></div>} />
            <div className="px-5 pt-3">
              <div className="relative max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input className="w-full pl-9" placeholder="Search merchant or description" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search recent transactions" />
              </div>
            </div>
            <Async s={recent} rows={5}>
              {(d) => (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Merchant</Th><Th>Category</Th><Th>Description</Th><Th>Type</Th><Th className="text-right">Amount</Th></tr></thead>
                  <tbody>
                    {d.items.length === 0 && <tr><Td colSpan={6} className="py-8 text-center text-muted">No transactions match “{q}”.</Td></tr>}
                    {d.items.map((t) => (
                      <tr key={t.transaction_id} className="hover:bg-white/[0.025]">
                        <Td className="whitespace-nowrap text-muted">{dateFmt(t.transaction_date)}</Td>
                        <Td className="font-medium text-white">{t.merchant_name}</Td>
                        <Td>{t.category_name}</Td>
                        <Td className="text-muted">{t.description ?? "—"}</Td>
                        <Td><Badge tone={t.transaction_type === "INCOME" ? "teal" : "rose"}>{t.transaction_type === "INCOME" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}{t.transaction_type === "INCOME" ? "Income" : "Expense"}</Badge></Td>
                        <Td className={`text-right font-medium tabular-nums ${t.transaction_type === "INCOME" ? "text-accent" : "text-loss"}`}>{t.transaction_type === "INCOME" ? "+" : "−"}{inr(t.amount, true)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Async>
          </Card>
        </>
      )}
    </>
  );
}
