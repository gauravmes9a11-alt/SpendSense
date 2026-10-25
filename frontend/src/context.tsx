import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { API_BASE } from "./lib/config";

export type Row = Record<string, any>;
export type HealthState = "checking" | "connected" | "disconnected" | "error";
export type Health = { state: HealthState; message?: string; database?: string; version?: string };
export type DbObject = { name: string; kind: "table" | "view"; exists: boolean; used_by: string };
export type Meta = { currency: string; users: Row[]; categories: Row[]; objects: DbObject[] };

type Ctx = {
  refreshKey: number;
  refreshing: boolean;
  refresh: () => void;
  userId: number | undefined;
  setUserId: (id: number | undefined) => void;
  health: Health;
  meta: Meta | null;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [meta, setMeta] = useState<Meta | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const body = await res.json();
      // "Connected" is only ever shown when the backend itself reports a verified MySQL round-trip.
      if (res.ok && body.status === "connected") {
        setHealth({ state: "connected", database: body.database, version: body.server_version });
      } else {
        setHealth({ state: body.status === "error" ? "error" : "disconnected", message: body.message });
      }
    } catch {
      setHealth({ state: "disconnected", message: "The SpendSense API is not reachable. Start the backend on port 8000." });
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/meta`);
      setMeta(res.ok ? await res.json() : null);
    } catch {
      setMeta(null);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    loadMeta();
    const id = window.setInterval(checkHealth, 30000);
    return () => window.clearInterval(id);
  }, [checkHealth, loadMeta, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    window.setTimeout(() => setRefreshing(false), 700);
  }, []);

  const value = useMemo(
    () => ({ refreshKey, refreshing, refresh, userId, setUserId, health, meta }),
    [refreshKey, refreshing, refresh, userId, health, meta],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}
