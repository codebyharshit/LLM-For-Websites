export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Fetch the tenant API with the session cookie included (CORS credentials). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return (await res.json()) as T;
}
