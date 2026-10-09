import type { DataSet } from "@/lib/types";

// Server URL — embedded at build time; falls back to the production deployment.
const ENV_SERVER = process.env.NEXT_PUBLIC_API_URL || "https://zero-degree.vercel.app";

/** Where the API lives: this origin on the web, the production deployment inside the Android app. */
export function getServerBase(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("ZERO_DEGREE_SERVER_URL");
    if (stored) return stored.replace(/\/$/, "");
    const origin = window.location.origin;
    // Capacitor / file / local — use the production URL
    const isCapacitor = origin.startsWith("capacitor:") || origin.startsWith("file:") || origin === "https://localhost" || origin === "http://localhost";
    if (isCapacitor) return ENV_SERVER.replace(/\/$/, "");
    // Web: use current origin (supports preview deployments and `npm run dev`)
    return origin;
  }
  return ENV_SERVER.replace(/\/$/, "");
}

export type SyncResult = { ok: boolean; error?: string; emailed?: boolean; stored?: boolean };

/** POSTs one report job; the server stores it (by jobId) and emails it to the admin team. */
export async function postJob(jobId: string, reporterName: string, payload: DataSet, recipients: string[] = [], email = true): Promise<SyncResult> {
  const base = getServerBase();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
    const res = await fetch(`${base}/api/sync/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, reporterName, recipients, email, ...payload }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, emailed: !!body.emailed, stored: !!body.stored, error: body.emailError };
    return { ok: false, error: body.error || `Server error ${res.status}` };
  } catch (err) {
    return { ok: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

export type TeamSubmission = { jobId: string; reporterName: string; createdAt: string; updatedAt: string; payload: DataSet };

/** Every report submitted to the cloud for this company. */
export async function fetchTeamData(company: string): Promise<TeamSubmission[]> {
  const res = await fetch(`${getServerBase()}/api/team?company=${encodeURIComponent(company)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
  return body.submissions as TeamSubmission[];
}
