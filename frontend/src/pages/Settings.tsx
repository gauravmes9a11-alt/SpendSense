import { CheckCircle2, XCircle } from "lucide-react";
import { useApp, type Row } from "../context";
import { apiUrl, useApi } from "../lib/api";
import { Async, Badge, Card, CardHead, KV, Loading, PageHeader, Table, Td, Th } from "../components/ui";

export default function SettingsPage() {
  const { health, meta } = useApp();
  const s = useApi<Row>("/api/settings");
  return (
    <>
      <PageHeader title="Settings" subtitle="Connection details are read from backend/.env on the server. Credentials never reach the browser, so they are not shown or editable here." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="Connection" />
          <dl className="px-5 pb-4 pt-2">
            <KV k="Status" v={<Badge tone={health.state === "connected" ? "teal" : health.state === "checking" ? "slate" : health.state === "error" ? "rose" : "amber"}>{health.state === "connected" ? "Connected" : health.state === "error" ? "Error" : health.state === "checking" ? "Checking" : "Disconnected"}</Badge>} />
            {health.message && <KV k="Detail" v={health.message} />}
            <Async s={s} rows={3}>{(d) => (<><KV k="Database" v={d.database} /><KV k="MySQL version" v={d.server_version} /><KV k="Display currency" v={`${d.currency} (₹), no conversion applied`} />
              <KV k="Console limits" v={`${d.console_limits.max_rows} rows, ${d.console_limits.timeout_ms / 1000} s`} /></>)}</Async>
            <KV k="API documentation" v={<a className="text-accent hover:underline" href={apiUrl("/docs")} target="_blank" rel="noreferrer">Open /docs</a>} />
          </dl>
        </Card>
        <Card>
          <CardHead title="Database objects this app uses" hint="Checked against information_schema" />
          {!meta ? <Loading rows={5} /> : (
            <Table>
              <thead><tr><Th>Object</Th><Th>Found</Th><Th>Used by</Th></tr></thead>
              <tbody>{meta.objects.map((o) => (
                <tr key={o.name}><Td className="font-medium text-white">{o.name}<span className="ml-2 text-xs text-muted">{o.kind}</span></Td>
                  <Td>{o.exists ? <span className="inline-flex items-center gap-1.5 text-accent"><CheckCircle2 size={15} />Yes</span> : <span className="inline-flex items-center gap-1.5 text-warn"><XCircle size={15} />Missing</span>}</Td>
                  <Td className="text-muted">{o.used_by}</Td></tr>))}</tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
