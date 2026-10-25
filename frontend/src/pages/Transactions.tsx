import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Search } from "lucide-react";
import { useApp, type Row } from "../context";
import { apiUrl, useApi, useDebounced } from "../lib/api";
import { dateFmt, inr } from "../lib/format";
import { Async, Badge, Button, Card, EmptyState, Input, KV, Label, Lineage, PageHeader, Pagination, Select, Sheet, Table, Td, Th } from "../components/ui";

export default function Transactions() {
  const { userId, meta } = useApp();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"date" | "amount">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const q = useDebounced(search);

  const filters = { q, user_id: userId, category_id: category, type, date_from: from, date_to: to, sort, order };
  const res = useApi<{ items: Row[]; total: number; total_pages: number }>("/api/transactions", { ...filters, page, page_size: 15 });
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const toggleSort = (col: "date" | "amount") => {
    if (sort === col) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(col); setOrder("desc"); }
    setPage(1);
  };
  const badRange = !!from && !!to && from > to;

  return (
    <>
      <PageHeader title="Transactions" subtitle="Search, filter and sort every record in the transactions table. Export covers the filtered results, not just this page."
        right={<a href={apiUrl("/api/transactions/export", filters)} className="inline-flex items-center gap-2 rounded-lg border border-line bg-lift/60 px-3 py-2 text-sm text-slate-200 hover:bg-lift" download><Download size={16} />Export CSV</a>} />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Label className="min-w-[14rem] flex-1">Search
            <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input className="w-full pl-9" placeholder="Merchant or description" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
          </Label>
          <Label>Category
            <Select value={category} onChange={(e) => reset(setCategory)(e.target.value)}>
              <option value="">All categories</option>
              {meta?.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </Select>
          </Label>
          <Label>Type
            <Select value={type} onChange={(e) => reset(setType)(e.target.value)}>
              <option value="">Income and expense</option><option value="EXPENSE">Expense</option><option value="INCOME">Income</option>
            </Select>
          </Label>
          <Label>From<Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></Label>
          <Label>To<Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></Label>
          <Button variant="ghost" onClick={() => { setSearch(""); setCategory(""); setType(""); setFrom(""); setTo(""); setPage(1); }}>Clear</Button>
        </div>
        {badRange && <p className="px-4 pt-3 text-sm text-warn">The start date is after the end date. Adjust the range to see results.</p>}
        <div className="flex justify-end px-4 pt-3"><Lineage from={["transactions", "merchants", "categories", "users"]} state={res} /></div>
        <Async s={res} rows={8}>
          {(d) => (
            <>
              <Table>
                <thead><tr>
                  <Th onClick={() => toggleSort("date")} active={sort === "date"} dir={order}>Date</Th>
                  <Th>Merchant</Th><Th>Category</Th><Th>User</Th><Th>Description</Th><Th>Type</Th>
                  <Th className="text-right" onClick={() => toggleSort("amount")} active={sort === "amount"} dir={order}>Amount</Th>
                </tr></thead>
                <tbody>
                  {d.items.length === 0 && <tr><Td colSpan={7}><EmptyState title="No transactions match these filters" body="Widen the date range or clear a filter." /></Td></tr>}
                  {d.items.map((t) => (
                    <tr key={t.transaction_id} tabIndex={0} onClick={() => setSelected(t)} onKeyDown={(e) => e.key === "Enter" && setSelected(t)} className="cursor-pointer hover:bg-white/[0.03]">
                      <Td className="whitespace-nowrap text-muted">{dateFmt(t.transaction_date)}</Td>
                      <Td className="font-medium text-white">{t.merchant_name}</Td>
                      <Td>{t.category_name}</Td>
                      <Td className="text-muted">{t.user_name}</Td>
                      <Td className="max-w-[16rem] truncate text-muted">{t.description ?? "—"}</Td>
                      <Td><Badge tone={t.transaction_type === "INCOME" ? "teal" : "rose"}>{t.transaction_type === "INCOME" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}{t.transaction_type === "INCOME" ? "Income" : "Expense"}</Badge></Td>
                      <Td className={`text-right font-medium tabular-nums ${t.transaction_type === "INCOME" ? "text-accent" : "text-loss"}`}>{t.transaction_type === "INCOME" ? "+" : "−"}{inr(t.amount, true)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} totalPages={d.total_pages} total={d.total} onChange={setPage} />
            </>
          )}
        </Async>
      </Card>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Transaction details">
        {selected && (
          <dl>
            <div className="mb-4 rounded-lg bg-ink/60 p-4">
              <p className="text-xs text-muted">{selected.transaction_type === "INCOME" ? "Income" : "Expense"}</p>
              <p className={`mt-1 font-display text-3xl font-semibold ${selected.transaction_type === "INCOME" ? "text-accent" : "text-loss"}`}>{inr(selected.amount, true)}</p>
            </div>
            <KV k="Transaction ID" v={`#${selected.transaction_id}`} />
            <KV k="Date" v={dateFmt(selected.transaction_date)} />
            <KV k="Merchant" v={selected.merchant_name} />
            <KV k="Category" v={selected.category_name} />
            <KV k="User" v={selected.user_name} />
            <KV k="Description" v={selected.description} />
            <KV k="Source" v={selected.source} />
            <KV k="Linked subscription" v={selected.subscription_name ?? "None"} />
            <KV k="Recorded at" v={dateFmt(selected.created_at)} />
          </dl>
        )}
      </Sheet>
    </>
  );
}
