export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Session token store. The dashboard and API are on different domains, so cross-site cookies are
// blocked by Safari/Brave; we keep the token in localStorage and send it as a Bearer header.
const TOKEN_KEY = "sid";
export function setToken(t: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}
function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Friendlier wording for known backend error codes that lack a message.
const FRIENDLY: Record<string, string> = {
  unauthorized: "Please sign in to continue.",
  invalid_request: "Please check the form and try again.",
  bot_not_found: "We couldn't find your bot.",
  source_not_found: "That content source no longer exists.",
  cannot_resync: "This source can't be re-synced (only website/sitemap sources can).",
  rate_limited: "Too many requests — please wait a moment and try again.",
  internal_error: "Something went wrong on our end. Please try again.",
};

/** Fetch the tenant API with the session cookie; throws ApiError with a readable message. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let message = `Something went wrong (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      if (body.message) message = body.message;
      else if (body.error) message = FRIENDLY[body.error] ?? body.error.replace(/_/g, " ");
    } catch {
      // non-JSON body — keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  // Some endpoints return an empty/ok body.
  return (await res.json().catch(() => undefined)) as T;
}
