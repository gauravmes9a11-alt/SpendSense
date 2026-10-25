import { useState } from "react";
import { Eye, KeyRound, Link2, Play, Table2, Timer } from "lucide-react";
import { type Row } from "../context";
import { apiPost, useApi } from "../lib/api";
import { num } from "../lib/format";
import { cn } from "../lib/utils";
import { Async, AutoTable, Badge, Button, Card, CardHead, EmptyState, ErrorState, Lineage, Loading, Notice, PageHeader, Segmented, Table, Td, Th } from "../components/ui";

type DetailTab = "columns" | "keys" | "preview" | "definition";

const PRESETS: { label: string; sql: string; params?: string }[] = [
  { label: "Monthly spending by category (view)", sql: "SELECT * FROM v_monthly_category_spending WHERE user_id = :uid ORDER BY month, total_spending DESC", params: '{"uid": 1}' },
  { label: "Top merchants", sql: "SELECT m.merchant_name, ROUND(SUM(t.amount), 2) AS total_spent, COUNT(*) AS transaction_count\nFROM transactions t JOIN merchants m ON m.merchant_id = t.merchant_id\nWHERE t.transaction_type = 'EXPENSE'\nGROUP BY m.merchant_id, m.merchant_name\nORDER BY total_spent DESC" },
  { label: "LAG: month-to-month subscription charges", sql: "WITH monthly AS (\n  SELECT subscription_id, DATE_FORMAT(transaction_date, '%Y-%m') AS billing_month, SUM(amount) AS month_charge\n  FROM transactions WHERE subscription_id IS NOT NULL GROUP BY subscription_id, DATE_FORMAT(transaction_date, '%Y-%m')\n)\nSELECT subscription_id, billing_month, month_charge,\n       LAG(month_charge) OVER (PARTITION BY subscription_id ORDER BY billing_month) AS previous_charge\nFROM monthly ORDER BY subscription_id, billing_month" },
  { label: "EXPLAIN a transactions lookup (index use)", sql: "SELECT t.transaction_id, t.amount FROM transactions t WHERE t.user_id = :uid AND t.transaction_date >= '2026-08-01'", params: '{"uid": 1}' },
];

export default function Explorer() {
  const tables = useApi<{ database: string; items: Row[] }>("/api/database/tables");
  const rels = useApi<{ relationships: Row[] }>("/api/database/schema");
  const [selected, setSelected] = useState("transactions");
  const [tab, setTab] = useState<DetailTab>("columns");
  const schema = useApi<Row>(selected ? "/api/database/schema" : null, { table: selected });
  const preview = useApi<Row>(tab === "preview" && selected ? "/api/database/table-preview" : null, { table: selected, limit: 20 });

  return (
    <>
      <PageHeader title="Database explorer" subtitle="Everything here is read from MySQL metadata (information_schema) and read-only queries. Row counts are exact COUNT(*) values." right={<Lineage from={["information_schema"]} state={tables} />} />
      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <Card className="h-fit">
          <CardHead title={tables.data ? `Database ${tables.data.database}` : "Objects"} />
          <Async s={tables} rows={8}>
            {(d) => (
              <ul className="p-2">
                {d.items.map((t) => (
                  <li key={t.name}>
                    <button onClick={() => { setSelected(t.name); if (t.kind === "table" && tab === "definition") setTab("columns"); }}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm", selected === t.name ? "bg-accent/12 text-accent" : "text-slate-300 hover:bg-white/5")}>
                      {t.kind === "view" ? <Eye size={15} className="shrink-0" /> : <Table2 size={15} className="shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="tabular-nums text-xs text-muted">{t.row_count == null ? "?" : num(t.row_count)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHead title={selected} hint={schema.data ? (schema.data.kind === "view" ? "View" : "Table") : undefined}
              right={<Segmented value={tab} onChange={setTab} options={[{ value: "columns", label: "Columns" }, { value: "keys", label: "Keys and indexes" }, { value: "preview", label: "Preview" }, ...(schema.data?.kind === "view" ? [{ value: "definition" as DetailTab, label: "Definition" }] : [])]} />} />
            <div className="mt-3">
              {tab === "preview" ? (
                <Async s={preview} rows={6}>{(d) => <AutoTable columns={d.columns} rows={d.rows} raw />}</Async>
              ) : (
                <Async s={schema} rows={6}>
                  {(d) => tab === "columns" ? (
                    <Table>
                      <thead><tr><Th>Column</Th><Th>Data type</Th><Th>Nullable</Th><Th>Key</Th><Th>Default</Th><Th>Extra</Th></tr></thead>
                      <tbody>{d.columns.map((c: Row) => (
                        <tr key={c.name} className="hover:bg-white/[0.025]">
                          <Td className="font-medium text-white">{c.name}</Td><Td className="text-azure">{c.data_type}</Td><Td>{c.nullable ? "Yes" : "No"}</Td>
                          <Td>{c.key_type === "PRI" ? <Badge tone="teal"><KeyRound size={11} />Primary</Badge> : c.key_type === "MUL" ? <Badge tone="blue">Indexed</Badge> : c.key_type === "UNI" ? <Badge tone="amber">Unique</Badge> : "—"}</Td>
                          <Td className="text-muted">{c.default_value ?? "—"}</Td><Td className="text-muted">{c.extra || "—"}</Td>
                        </tr>))}</tbody>
                    </Table>
                  ) : tab === "keys" ? (
                    <div className="space-y-5 p-5">
                      <div><h4 className="mb-2 text-sm font-medium text-white">Primary key</h4>{d.primary_key.length ? <Badge tone="teal"><KeyRound size={11} />{d.primary_key.join(", ")}</Badge> : <p className="text-sm text-muted">None{d.kind === "view" ? " (views have no keys)" : ""}.</p>}</div>
                      <div><h4 className="mb-2 text-sm font-medium text-white">Foreign keys</h4>{d.foreign_keys.length === 0 ? <p className="text-sm text-muted">None.</p> :
                        <ul className="space-y-1.5 text-sm">{d.foreign_keys.map((f: Row, i: number) => <li key={i} className="flex items-center gap-2"><Link2 size={14} className="text-azure" /><span className="text-white">{f.column}</span> references <span className="text-azure">{f.ref_table}.{f.ref_column}</span><span className="text-xs text-muted">({f.constraint_name})</span></li>)}</ul>}</div>
                      <div><h4 className="mb-2 text-sm font-medium text-white">Indexes</h4>{d.indexes.length === 0 ? <p className="text-sm text-muted">None.</p> :
                        <ul className="space-y-1.5 text-sm">{d.indexes.map((x: Row) => <li key={x.name} className="flex flex-wrap items-center gap-2"><span className="font-medium text-white">{x.name}</span><span className="text-muted">on ({x.columns.join(", ")})</span>{x.unique && <Badge tone="amber">Unique</Badge>}</li>)}</ul>}</div>
                    </div>
                  ) : (
                    <div className="p-5">{d.definition ? <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-xs leading-relaxed text-slate-300">{d.definition}</pre> : <Notice title="Definition not available">MySQL only returns a view definition to accounts with the SHOW VIEW privilege. Grant it to the backend user to display it here.</Notice>}</div>
                  )}
                </Async>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Relationships" hint="Foreign keys across the whole schema" right={<Lineage from={["information_schema"]} state={rels} />} />
            <Async s={rels} rows={4}>
              {(d) => d.relationships.length === 0 ? <EmptyState title="No foreign keys found" /> : (
                <Table><thead><tr><Th>Table</Th><Th>Column</Th><Th>References</Th></tr></thead>
                  <tbody>{d.relationships.map((r: Row, i: number) => <tr key={i} className="hover:bg-white/[0.025]"><Td className="font-medium text-white">{r.table}</Td><Td>{r.column}</Td><Td className="text-azure">{r.ref_table}.{r.ref_column}</Td></tr>)}</tbody></Table>
              )}
            </Async>
          </Card>

          <Console />
        </div>
      </div>
    </>
  );
}

function Console() {
  const [sql, setSql] = useState(PRESETS[0].sql);
  const [params, setParams] = useState(PRESETS[0].params ?? "");
  const [result, setResult] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setError(null);
    let parsed: Record<string, unknown> = {};
    if (params.trim()) {
      try { parsed = JSON.parse(params); if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) throw new Error(); }
      catch { setError('Parameters must be a JSON object, for example {"uid": 1}.'); return; }
    }
    setRunning(true);
    try { setResult(await apiPost<Row>("/api/database/query", { sql, params: parsed })); }
    catch (e) { setResult(null); setError(e instanceof Error ? e.message : "The query failed."); }
    finally { setRunning(false); }
  };

  return (
    <Card>
      <CardHead title="Read-only query console" hint="SELECT only. Runs in a read-only transaction with a 5 second limit and a 500 row cap. Use :name placeholders with the parameter box so values are bound, never pasted into SQL."
        right={<Badge tone="teal">Read-only</Badge>} />
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => <Button key={p.label} variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => { setSql(p.sql); setParams(p.params ?? ""); setResult(null); setError(null); }}>{p.label}</Button>)}
        </div>
        <textarea value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} rows={7} aria-label="SQL query"
          className="w-full rounded-lg border border-line bg-ink p-3 font-mono text-[13px] leading-relaxed text-slate-100 focus:border-accent/60 focus:outline-none" />
        <div className="flex flex-wrap items-center gap-3">
          <input value={params} onChange={(e) => setParams(e.target.value)} placeholder='Parameters as JSON, e.g. {"uid": 1}' aria-label="Query parameters"
            className="min-w-[16rem] flex-1 rounded-lg border border-line bg-ink/70 px-3 py-2 font-mono text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none" />
          <Button variant="primary" onClick={run} disabled={running}><Play size={15} />{running ? "Running" : "Run query"}</Button>
        </div>
      </div>
      {error && <ErrorState message={error} hint="Only single SELECT statements are accepted. Writes and DDL are blocked." />}
      {running && !result && <Loading rows={3} />}
      {result && (
        <div className="border-t border-line">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 text-accent"><Timer size={13} />{result.elapsed_ms} ms measured on the server</span>
            <span>{result.row_count} row{result.row_count === 1 ? "" : "s"}</span>
            {result.truncated && <Badge tone="amber">Truncated at {result.max_rows} rows</Badge>}
          </div>
          <AutoTable columns={result.columns} rows={result.rows} raw />
        </div>
      )}
    </Card>
  );
}
