import { useEffect, useState } from "react";
import { useApp } from "../context";
import { API_BASE } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function qs(params: Record<string, unknown> = {}): string {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const apiUrl = (path: string, params?: Record<string, unknown>) => `${API_BASE}${path}${qs(params)}`;

async function toError(res: Response): Promise<ApiError> {
  let msg = `Request failed (${res.status}).`;
  try {
    const b = await res.json();
    if (typeof b.detail === "string") msg = b.detail;
    else if (Array.isArray(b.detail)) msg = b.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {
    /* keep default message */
  }
  return new ApiError(msg, res.status);
}

const NETWORK_MSG = "Cannot reach the SpendSense API. Is the backend running on port 8000?";

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(NETWORK_MSG, 0);
  }
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

export type ApiState<T> = { data: T | null; error: string | null; loading: boolean; ms: number | null; queries: number | null };

/** GET hook. Re-fetches when the URL changes or the global refresh button is pressed. Pass null to skip. */
export function useApi<T = any>(path: string | null, params: Record<string, unknown> = {}): ApiState<T> {
  const { refreshKey } = useApp();
  const target = path ? apiUrl(path, params) : null;
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: !!path, ms: null, queries: null });

  useEffect(() => {
    if (!target) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(target, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw await toError(res);
        const data = (await res.json()) as T;
        const ms = res.headers.get("X-DB-Time-Ms");
        const q = res.headers.get("X-DB-Queries");
        setState({ data, error: null, loading: false, ms: ms ? Number(ms) : null, queries: q ? Number(q) : null });
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof ApiError ? e.message : NETWORK_MSG }));
      });
    return () => ctrl.abort();
  }, [target, refreshKey]);

  return state;
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}
