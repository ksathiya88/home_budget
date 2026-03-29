// Placeholder API client for API Gateway-backed endpoints.
const API_BASE = process.env.REACT_APP_API_BASE || "https://api.example.com";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export async function request<T>(path: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}
