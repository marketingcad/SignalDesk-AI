import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const platform = searchParams.get("platform") || "All";
  const duplicate = searchParams.get("duplicate") || "All"; // "All" | "true" | "false"
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Only return posts belonging to this user's sessions
  let query = supabase
    .from("scraped_posts")
    .select(
      `id, author, description, post_url, platform, post_date,
       matched_keywords, lead_id, is_duplicate, created_at,
       scrape_url_sessions!inner ( scraped_url, scraped_at, user_id )`,
      { count: "exact" }
    )
    .eq("scrape_url_sessions.user_id", session.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (platform !== "All") {
    query = query.eq("platform", platform);
  }
  if (duplicate === "true") {
    query = query.eq("is_duplicate", true);
  } else if (duplicate === "false") {
    query = query.eq("is_duplicate", false);
  }
  if (search) {
    query = query.or(`author.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[scraped-posts] Fetch error:", error.message);
    return NextResponse.json({ error: "Failed to fetch scraped posts" }, { status: 500 });
  }

  return NextResponse.json({ posts: data, count: count ?? 0 });
}
