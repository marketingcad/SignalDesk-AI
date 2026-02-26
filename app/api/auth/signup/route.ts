import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import {
  verifySession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Require authenticated session (admin only)
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    const { email, password, full_name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        email: normalizedEmail,
        password_hash: passwordHash,
        full_name: full_name?.trim() || null,
      })
      .select("id, email, full_name")
      .single();

    if (insertError || !newUser) {
      console.error("User creation error:", insertError);
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
