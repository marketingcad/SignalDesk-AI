import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { email, full_name, avatar_url, current_password, new_password } =
      body;

    const updates: Record<string, string> = {};

    if (email && email !== session.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }
      const normalizedEmail = email.toLowerCase().trim();

      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .neq("id", session.userId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 409 }
        );
      }
      updates.email = normalizedEmail;
    }

    if (full_name !== undefined) {
      updates.full_name = full_name;
    }

    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url;
    }

    if (new_password) {
      if (!current_password) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }
      if (new_password.length < 8) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters" },
          { status: 400 }
        );
      }

      const { data: user } = await supabase
        .from("users")
        .select("password_hash")
        .eq("id", session.userId)
        .single();

      if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401 }
        );
      }

      updates.password_hash = await bcrypt.hash(new_password, 12);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "No changes to apply" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.userId);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
