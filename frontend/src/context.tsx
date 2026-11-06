import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "./lib/config";

export type Row = Record<string, any>;

export type HealthState =
  | "checking"
  | "connected"
  | "disconnected"
  | "error";

export type Health = {
  state: HealthState;
  message?: string;
  database?: string;
  version?: string;
};

export type DbObject = {
  name: string;
  kind: "table" | "view";
  exists: boolean;
  used_by: string;
};

export type Meta = {
  currency: string;
  users: Row[];
  categories: Row[];
  objects: DbObject[];
};

export type AppUser = {
  id?: number;
  user_id?: number;
  email: string;
  role: string;
  [key: string]: any;
};

export type LoginResult = {
  success: boolean;
  error?: string;
};

type Ctx = {
  refreshKey: number;
  refreshing: boolean;
  refresh: () => void;
  userId: number | undefined;
  setUserId: (id: number | undefined) => void;
  health: Health;
  meta: Meta | null;
  user: AppUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<number | undefined>(undefined);

  const [health, setHealth] = useState<Health>({
    state: "checking",
  });

  const [meta, setMeta] = useState<Meta | null>(null);

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("spendsense_token")
  );

  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const savedUser = localStorage.getItem("spendsense_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const id = user?.id ?? user?.user_id;
    setUserId(id !== undefined ? Number(id) : undefined);
  }, [user]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          return {
            success: false,
            error:
              body.detail ||
              body.message ||
              "Authentication failed. Check your credentials.",
          };
        }

        if (!body.access_token || !body.user) {
          return {
            success: false,
            error: "Invalid login response from server.",
          };
        }

        localStorage.setItem("spendsense_token", body.access_token);
        localStorage.setItem(
          "spendsense_user",
          JSON.stringify(body.user)
        );

        setToken(body.access_token);
        setUser(body.user);

        const id = body.user.id ?? body.user.user_id;
        setUserId(id !== undefined ? Number(id) : undefined);

        return { success: true };
      } catch {
        return {
          success: false,
          error: "Cannot connect to the SpendSense server.",
        };
      }
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem("spendsense_token");
    localStorage.removeItem("spendsense_user");

    setToken(null);
    setUser(null);
    setUserId(undefined);
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const body = await res.json();

      if (res.ok && body.status === "connected") {
        setHealth({
          state: "connected",
          database: body.database,
          version: body.server_version,
        });
      } else {
        setHealth({
          state: body.status === "error" ? "error" : "disconnected",
          message: body.message,
        });
      }
    } catch {
      setHealth({
        state: "disconnected",
        message:
          "The SpendSense API is not reachable. Start the backend on port 8000.",
      });
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

    const intervalId = window.setInterval(checkHealth, 30000);

    return () => window.clearInterval(intervalId);
  }, [checkHealth, loadMeta, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((key) => key + 1);

    window.setTimeout(() => {
      setRefreshing(false);
    }, 700);
  }, []);

  const value = useMemo(
    () => ({
      refreshKey,
      refreshing,
      refresh,
      userId,
      setUserId,
      health,
      meta,
      user,
      token,
      login,
      logout,
    }),
    [
      refreshKey,
      refreshing,
      refresh,
      userId,
      health,
      meta,
      user,
      token,
      login,
      logout,
    ]
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): Ctx {
  const context = useContext(AppCtx);

  if (!context) {
    throw new Error("useApp must be used inside AppProvider");
  }

  return context;
}
