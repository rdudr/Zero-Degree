import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CORS_HEADERS, companyKeyOf } from "@/lib/server/report";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Every report submitted for a company, newest first — "Pull team data" on
 * the Report page merges them on the device (tag + newest save wins).
 * GET /api/team?company=<company name>
 */
export async function GET(req: Request) {
  const company = new URL(req.url).searchParams.get("company") || "";
  const key = companyKeyOf(company);
  if (!key) return NextResponse.json({ error: "Pass ?company=<company name>" }, { status: 400, headers: CORS_HEADERS });
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Team cloud is not set up on this server (DATABASE_URL missing). Share Excel files instead." }, { status: 503, headers: CORS_HEADERS });
  }
  try {
    const rows = await prisma.submission.findMany({
      where: { companyKey: key },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { jobId: true, reporterName: true, createdAt: true, updatedAt: true, payload: true },
    });
    return NextResponse.json({ ok: true, company, submissions: rows }, { headers: CORS_HEADERS });
  } catch (e) {
    console.error("[TEAM]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS_HEADERS });
  }
}
