import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import {
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const { data: user, error: queryError } = await supabase
      .from("users")
      .select("id, email, password_hash")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (queryError) {
      console.error("Login query error:", queryError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Look up the authorization role. Resilient to the role column not yet
    // existing (pre-migration): on error we default to "member" rather than
    // failing the login.
    let role = "member";
    const { data: roleRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (roleRow?.role) role = roleRow.role;

    const token = await createSession({
      userId: user.id,
      email: user.email,
      role,
    });

    const response = NextResponse.json({ success: true, token });
    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
