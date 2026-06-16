import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Bookmark = {
  id: string;
  url: string;
  name: string;
  platform: string | null;
  notes: string;
  favorite: boolean;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBookmark(row: any): Bookmark {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    platform: row.platform,
    notes: row.notes ?? "",
    favorite: row.favorite ?? false,
    createdAt: row.created_at,
  };
}

async function auth(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await verifySession(token) : null;
}

export async function GET(request: NextRequest) {
  const session = await auth(request);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/bookmarks] List error:", error);
    return NextResponse.json({ error: "Failed to load bookmarks" }, { status: 500 });
  }

  return NextResponse.json({ bookmarks: (data ?? []).map(toBookmark) });
}

export async function POST(request: NextRequest) {
  const session = await auth(request);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body.url?.trim())
    return NextResponse.json({ error: "URL is required" }, { status: 400 });

  const url = body.url.trim();
  const { data, error } = await supabase
    .from("bookmarks")
    .insert({
      url,
      name: body.name?.trim() || url,
      platform: body.platform || null,
      notes: body.notes?.trim() || "",
      favorite: false,
      user_id: session.userId,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation (user already saved this URL)
    if (error.code === "23505") {
      return NextResponse.json({ error: "URL already bookmarked" }, { status: 409 });
    }
    console.error("[api/bookmarks] Insert error:", error);
    return NextResponse.json({ error: "Failed to save bookmark" }, { status: 500 });
  }

  return NextResponse.json({ bookmark: toBookmark(data) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth(request);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json().catch(() => ({ id: null }));
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("id", id)
    .eq("user_id", session.userId);

  if (error) {
    console.error("[api/bookmarks] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete bookmark" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const session = await auth(request);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.url !== undefined) updates.url = body.url.trim();
  if (body.notes !== undefined) updates.notes = body.notes.trim();
  if (body.platform !== undefined) updates.platform = body.platform;
  if (body.favorite !== undefined) updates.favorite = body.favorite;

  const { data, error } = await supabase
    .from("bookmarks")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", session.userId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[api/bookmarks] Update error:", error);
    return NextResponse.json({ error: "Failed to update bookmark" }, { status: 500 });
  }

  return NextResponse.json({ bookmark: toBookmark(data) });
}
