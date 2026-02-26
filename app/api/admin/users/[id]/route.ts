import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Prevent deleting yourself
    if (id === session.userId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) {
      console.error("Delete user error:", error);
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
