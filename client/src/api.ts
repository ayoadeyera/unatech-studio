const configuredApiBase = import.meta.env?.VITE_API_URL?.trim() ?? "";

export const API_BASE_URL = configuredApiBase.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function messageFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("message" in payload)) return undefined;
  const message = payload.message;
  return typeof message === "string" && message.trim() ? message : undefined;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    const baseHint = API_BASE_URL
      ? ` Check that VITE_API_URL points to the Express server (${API_BASE_URL}).`
      : " Start the Express server with `cd server` then `npm start`; Vite proxies /api to http://127.0.0.1:5000 by default.";
    throw new Error(`Could not reach the UnaTech API at ${url}.${baseHint}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    const type = contentType || "an unknown content type";
    throw new Error(
      `The UnaTech API request to ${path} returned non-JSON data (HTTP ${response.status}, ${type}). ` +
      "Check that Express is running and that Vite's /api proxy or VITE_API_URL targets the backend, not the frontend."
    );
  }

  if (!contentType.toLowerCase().includes("application/json") && !contentType.toLowerCase().includes("+json")) {
    throw new Error(
      `The UnaTech API request to ${path} returned ${contentType || "a non-JSON response"} (HTTP ${response.status}). ` +
      "Check that Express is running and that Vite's /api proxy or VITE_API_URL targets the backend, not the frontend."
    );
  }

  if (!response.ok) {
    throw new Error(messageFromPayload(payload) ?? `UnaTech API request failed with HTTP ${response.status}.`);
  }

  return payload as T;
}
