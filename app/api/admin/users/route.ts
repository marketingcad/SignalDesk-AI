import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, full_name, avatar_url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch users error:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: users || [] });
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
