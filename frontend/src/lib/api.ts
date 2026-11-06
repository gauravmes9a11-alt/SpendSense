import { useEffect, useState } from "react";
import { useApp } from "../context";
import { API_BASE } from "./config";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function qs(params: Record<string, unknown> = {}): string {
  const u = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      u.set(key, String(value));
    }
  });

  const result = u.toString();
  return result ? `?${result}` : "";
}

export const apiUrl = (
  path: string,
  params?: Record<string, unknown>
) => `${API_BASE}${path}${qs(params)}`;

const NETWORK_MSG =
  "Cannot reach the SpendSense API. Is the backend running on port 8000?";

/**
 * Reads the current JWT from the browser session storage.
 * Requests without a token remain usable for public endpoints.
 */
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("spendsense_token");

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`;

  try {
    const body = await res.json();

    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail
        .map((item: { msg?: string }) => item.msg || "Invalid request")
        .join("; ");
    } else if (typeof body.message === "string") {
      message = body.message;
    }
  } catch {
    // Keep the default error message.
  }

  return new ApiError(message, res.status);
}

/**
 * POST request helper.
 * Automatically attaches the JWT when one is available.
 */
export async function apiPost<T>(
  path: string,
  body: unknown
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_MSG, 0);
  }

  if (!res.ok) {
    throw await toError(res);
  }

  return res.json() as Promise<T>;
}

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  ms: number | null;
  queries: number | null;
};

/**
 * GET hook.
 * Re-fetches when the URL changes, the JWT changes,
 * or the global refresh button is pressed.
 * Pass null as the path to skip the request.
 */
export function useApi<T = any>(
  path: string | null,
  params: Record<string, unknown> = {}
): ApiState<T> {
  const { refreshKey, token } = useApp();

  const target = path ? apiUrl(path, params) : null;

  const [state, setState] = useState<ApiState<T>>({
    data: null,
    error: null,
    loading: !!path,
    ms: null,
    queries: null,
  });

  useEffect(() => {
    if (!target) {
      setState({
        data: null,
        error: null,
        loading: false,
        ms: null,
        queries: null,
      });
      return;
    }

    const controller = new AbortController();

    setState((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    fetch(target, {
      signal: controller.signal,
      headers: getAuthHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw await toError(res);
        }

        const data = (await res.json()) as T;
        const dbTime = res.headers.get("X-DB-Time-Ms");
        const dbQueries = res.headers.get("X-DB-Queries");

        setState({
          data,
          error: null,
          loading: false,
          ms: dbTime ? Number(dbTime) : null,
          queries: dbQueries ? Number(dbQueries) : null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setState((previous) => ({
          ...previous,
          loading: false,
          error:
            error instanceof ApiError
              ? error.message
              : NETWORK_MSG,
        }));
      });

    return () => controller.abort();
  }, [target, refreshKey, token]);

  return state;
}

export function useDebounced<T>(
  value: T,
  delay = 300
): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
