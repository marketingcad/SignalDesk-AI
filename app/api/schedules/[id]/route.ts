import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || "http://localhost:4000";
const SCRAPER_TOKEN = process.env.BACKEND_AUTH_TOKEN || "";

async function proxyToScraper(method: string, path: string, body?: unknown) {
  const resp = await fetch(`${SCRAPER_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SCRAPER_TOKEN}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await resp.json().catch(() => ({}));
  return { data, status: resp.status };
}

async function auth(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await verifySession(token) : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await auth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, status } = await proxyToScraper("GET", `/api/schedules/${id}`);
    return NextResponse.json(data, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await auth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const { data, status } = await proxyToScraper("PATCH", `/api/schedules/${id}`, body);
    return NextResponse.json(data, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await auth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, status } = await proxyToScraper("DELETE", `/api/schedules/${id}`);
    return NextResponse.json(data, { status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
