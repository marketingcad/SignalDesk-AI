import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/mail";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const { data: user } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const token = await createResetToken(user.email);
    const baseUrl = request.nextUrl.origin;
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, resetLink);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
