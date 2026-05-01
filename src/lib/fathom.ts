/**
 * Fathom API client.
 *
 *   Base URL: https://api.fathom.video/v1
 *   Auth:     Authorization: Bearer <FATHOM_API_KEY>
 *
 * Endpoints we use:
 *   GET /calls                   list calls + metadata
 *   GET /calls/:id/transcript    full transcript
 *   GET /calls/:id/summary       AI summary
 *
 * Defensive parsing: Fathom's response shapes have varied; we accept
 * either { calls: [...] } or [...] for list, and either a string or
 * { transcript: "..." } / { summary: "..." } for the detail endpoints.
 */

const FATHOM_BASE = "https://api.fathom.video/v1";

export interface FathomCall {
  id: string;
  title: string | null;
  date: string | null;          // ISO timestamp
  duration_seconds: number | null;
  participants: string[];
  folder: string | null;
}

export interface FathomCallDetail {
  transcript: string;
  summary: string;
}

export class FathomRateLimitError extends Error {
  constructor(message = "Fathom rate limit hit") {
    super(message);
    this.name = "FathomRateLimitError";
  }
}

export class FathomAuthError extends Error {
  constructor(message = "Fathom auth failed (check FATHOM_API_KEY)") {
    super(message);
    this.name = "FathomAuthError";
  }
}

function getKey(): string | null {
  return process.env.FATHOM_API_KEY || null;
}

export function isFathomConfigured(): boolean {
  return !!getKey();
}

async function fathomFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getKey();
  if (!key) throw new Error("FATHOM_API_KEY not configured");

  const res = await fetch(`${FATHOM_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) throw new FathomAuthError();
  if (res.status === 429) throw new FathomRateLimitError();
  return res;
}

/**
 * Normalize a Fathom list payload into FathomCall[].
 * Tolerates several plausible response shapes since Fathom's API
 * documentation is sparse / changes occasionally.
 */
function normalizeCall(raw: Record<string, unknown>): FathomCall {
  const id =
    (raw.id as string | undefined) ||
    (raw.call_id as string | undefined) ||
    (raw.uuid as string | undefined) ||
    "";
  const title =
    (raw.title as string | null) ||
    (raw.name as string | null) ||
    (raw.meeting_title as string | null) ||
    null;
  const date =
    (raw.date as string | null) ||
    (raw.created_at as string | null) ||
    (raw.recorded_at as string | null) ||
    (raw.start_time as string | null) ||
    null;
  const duration_seconds =
    (raw.duration_seconds as number | undefined) ??
    (raw.duration as number | undefined) ??
    null;
  const folder =
    (raw.folder as string | null) ||
    (raw.folder_name as string | null) ||
    null;

  const partsRaw =
    (raw.participants as unknown[] | undefined) ||
    (raw.attendees as unknown[] | undefined) ||
    [];
  const participants: string[] = partsRaw
    .map((p) => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object") {
        const obj = p as Record<string, unknown>;
        return (
          (obj.name as string) ||
          (obj.display_name as string) ||
          (obj.email as string) ||
          ""
        );
      }
      return "";
    })
    .filter(Boolean);

  return { id, title, date, duration_seconds, participants, folder };
}

export async function listCalls(limit = 50): Promise<FathomCall[]> {
  const res = await fathomFetch(`/calls?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Fathom /calls failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as unknown;
  let arr: Record<string, unknown>[] = [];
  if (Array.isArray(json)) {
    arr = json as Record<string, unknown>[];
  } else if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.calls)) arr = obj.calls as Record<string, unknown>[];
    else if (Array.isArray(obj.data)) arr = obj.data as Record<string, unknown>[];
    else if (Array.isArray(obj.results)) arr = obj.results as Record<string, unknown>[];
  }
  return arr.map(normalizeCall).filter((c) => c.id);
}

export async function getCallTranscript(callId: string): Promise<string> {
  const res = await fathomFetch(`/calls/${encodeURIComponent(callId)}/transcript`);
  if (!res.ok) {
    throw new Error(`Fathom transcript failed (${res.status}): ${await res.text()}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = (await res.json()) as unknown;
    if (typeof json === "string") return json;
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      return (
        (obj.transcript as string) ||
        (obj.text as string) ||
        (obj.content as string) ||
        JSON.stringify(json)
      );
    }
  }
  return await res.text();
}

export async function getCallSummary(callId: string): Promise<string> {
  const res = await fathomFetch(`/calls/${encodeURIComponent(callId)}/summary`);
  if (!res.ok) {
    throw new Error(`Fathom summary failed (${res.status}): ${await res.text()}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = (await res.json()) as unknown;
    if (typeof json === "string") return json;
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      return (
        (obj.summary as string) ||
        (obj.text as string) ||
        (obj.content as string) ||
        JSON.stringify(json)
      );
    }
  }
  return await res.text();
}

export async function getCallMetadata(callId: string): Promise<FathomCall | null> {
  const res = await fathomFetch(`/calls/${encodeURIComponent(callId)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  return normalizeCall(json);
}
