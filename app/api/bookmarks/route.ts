import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const BOOKMARKS_FILE = path.join(process.cwd(), "scraper-service", "storage", "bookmarks.json");

type Bookmark = {
  id: string;
  url: string;
  name: string;
  platform: string | null;
  notes: string;
  favorite: boolean;
  createdAt: string;
};

async function readBookmarks(): Promise<Bookmark[]> {
  try {
    const raw = await fs.readFile(BOOKMARKS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeBookmarks(bookmarks: Bookmark[]) {
  await fs.mkdir(path.dirname(BOOKMARKS_FILE), { recursive: true });
  await fs.writeFile(BOOKMARKS_FILE, JSON.stringify(bookmarks, null, 2));
}

async function auth(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await verifySession(token) : null;
}

export async function GET(request: NextRequest) {
  if (!(await auth(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bookmarks = await readBookmarks();
  return NextResponse.json({ bookmarks });
}

export async function POST(request: NextRequest) {
  if (!(await auth(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.url?.trim()) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  const bookmarks = await readBookmarks();
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url: body.url.trim(),
    name: body.name?.trim() || body.url.trim(),
    platform: body.platform || null,
    notes: body.notes?.trim() || "",
    favorite: false,
    createdAt: new Date().toISOString(),
  };
  bookmarks.unshift(bookmark);
  await writeBookmarks(bookmarks);
  return NextResponse.json({ bookmark }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!(await auth(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json().catch(() => ({ id: null }));
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  let bookmarks = await readBookmarks();
  bookmarks = bookmarks.filter((b) => b.id !== id);
  await writeBookmarks(bookmarks);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  if (!(await auth(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  const bookmarks = await readBookmarks();
  const idx = bookmarks.findIndex((b) => b.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.name !== undefined) bookmarks[idx].name = body.name.trim();
  if (body.url !== undefined) bookmarks[idx].url = body.url.trim();
  if (body.notes !== undefined) bookmarks[idx].notes = body.notes.trim();
  if (body.platform !== undefined) bookmarks[idx].platform = body.platform;
  if (body.favorite !== undefined) bookmarks[idx].favorite = body.favorite;

  await writeBookmarks(bookmarks);
  return NextResponse.json({ bookmark: bookmarks[idx] });
}
