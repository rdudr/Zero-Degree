import { NextResponse } from "next/server";
import { CORS_HEADERS, mailReport, normalisePayload, saveSubmission } from "@/lib/server/report";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * One submitted report from a device (Submit, or an offline-queue retry).
 * 1. Saved to the database under its jobId — retries land on the same row.
 * 2. Emailed to the admin team with the PDF and the PostMan workbook.
 * The job counts as delivered when either step succeeds; both results are returned.
 * Pass `email: false` to store only (team-cloud upload without mailing the admins).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }
  const jobId = String(body.jobId || crypto.randomUUID());
  const reporterName = String(body.reporterName || "Field Engineer");
  const recipients = Array.isArray(body.recipients) ? (body.recipients as string[]) : [];
  const data = normalisePayload(body);

  const stored = await saveSubmission(jobId, reporterName, data);

  // `email: false` = "share with the team cloud only" from the Report page
  const wantEmail = body.email !== false;
  let emailed = false;
  let emailError: string | undefined;
  if (!wantEmail) {
    emailError = undefined;
  } else if (data.profile) {
    try {
      await mailReport(data, reporterName, recipients);
      emailed = true;
    } catch (e) {
      emailError = (e as Error).message;
      console.error("[SYNC] Email error:", emailError);
    }
  } else {
    emailError = "No company profile — email skipped";
  }

  if (!emailed && !stored.ok) {
    return NextResponse.json({ error: emailError || stored.error || "Nothing was delivered", stored: false, emailed: false }, { status: 500, headers: CORS_HEADERS });
  }
  return NextResponse.json({ ok: true, jobId, stored: stored.ok, emailed, emailError, dbError: stored.error }, { headers: CORS_HEADERS });
}
