// All amounts are shown in INR. No exchange rates are applied anywhere in the app.
const money0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const inr = (n: number | null | undefined, decimals = false): string =>
  n == null || Number.isNaN(Number(n)) ? "—" : (decimals || !Number.isInteger(Number(n)) ? money2 : money0).format(Number(n));
export const inrCompact = (n: number | null | undefined): string => (n == null ? "—" : compact.format(Number(n)));
export const num = (n: number | null | undefined): string => (n == null ? "—" : plain.format(Number(n)));
export const pct = (n: number | null | undefined): string => (n == null ? "—" : `${n > 0 ? "+" : ""}${plain.format(Number(n))}%`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateFmt = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};
export const monthFmt = (ym: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}` : ym;
};
export const title = (s: string): string => {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Format a cell from an arbitrary view/table using the column name as a hint. */
export function autoCell(key: string, v: unknown, raw = false): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (!raw && /(price|amount|total|spend|cost|saving|diff|expected|charge|spent)/i.test(key) && !/(pct|percent|count|days)/i.test(key)) return inr(v, true);
    return plain.format(v);
  }
  if (typeof v === "string" && !raw && /(date|_on$|_at$|used)/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(v)) return dateFmt(v);
  return String(v);
}
