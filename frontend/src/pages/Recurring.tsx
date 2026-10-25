import { useState } from "react";
import { Repeat } from "lucide-react";
import { useApp, type Row } from "../context";
import { useApi } from "../lib/api";
import { autoCell, title } from "../lib/format";
import { Async, Badge, Card, CardHead, EmptyState, Lineage, Notice, PageHeader, Segmented, StatBand, Table, Td, Th } from "../components/ui";
import { cn } from "../lib/utils";

export default function Recurring() {
  const { userId } = useApp();
  const [filter, setFilter] = useState<"all" | "confirmed" | "potential">("all");
  const res = useApi<Row>("/api/recurring-payments", { user_id: userId });

  return (
    <>
      <PageHeader title="Recurring payments" subtitle="Candidates come straight from the SQL view v_recurring_payment_candidates. A candidate is confirmed only when it matches a real row in the subscriptions table." />
      <Async s={res} rows={6}>
        {(d) => {
          if (!d.available) {
            return (
              <Notice title={`The view ${d.view} is missing`}>
                <p>{d.message}</p>
                <p className="mt-2">A template is in <code className="rounded bg-ink px-1">database/optional_views.sql</code>. Nothing is shown here until the view exists, and no sample rows are substituted.</p>
              </Notice>
            );
          }
          const rows: Row[] = d.rows.filter((r: Row) => filter === "all" || (filter === "confirmed" ? r._confirmed === true : r._confirmed !== true));
          const cols: string[] = d.columns.filter((c: string) => !/_id$/.test(c));
          return (
            <>
              <StatBand cells={[
                { label: "Candidates in the view", value: d.rows.length },
                { label: "Confirmed subscriptions", value: d.match_supported ? d.confirmed_count : "—", sub: d.match_supported ? "Match an active or paused subscription" : "View has no merchant column to match on", tone: "accent" },
                { label: "Potential recurring payments", value: d.match_supported ? d.potential_count : "—", sub: "No matching subscription record" },
              ]} />
              <Card>
                <CardHead title="Detected candidates" hint="Columns are exactly those returned by the view; the first column is added by SpendSense"
                  right={<div className="flex flex-wrap items-center gap-3"><Lineage from={[d.view, "subscriptions"]} state={res} />
                    <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "confirmed", label: "Confirmed" }, { value: "potential", label: "Potential" }]} /></div>} />
                {rows.length === 0 ? <EmptyState icon={<Repeat size={20} />} title="Nothing to show" body="No candidates match this filter." /> : (
                  <Table>
                    <thead><tr><Th>Classification</Th>{cols.map((c) => <Th key={c}>{title(c)}</Th>)}</tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-white/[0.025]">
                          <Td>
                            {r._confirmed === true ? <Badge tone="teal">Confirmed: {r._subscription}</Badge> : r._confirmed === false ? <Badge tone="amber">Potential</Badge> : <Badge>Unclassified</Badge>}
                          </Td>
                          {cols.map((c) => <Td key={c} className={cn(typeof r[c] === "number" && "text-right tabular-nums", /pattern/i.test(c) && "font-medium text-azure")}>{autoCell(c, r[c])}</Td>)}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </>
          );
        }}
      </Async>
    </>
  );
}
