import { NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = createServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Hard domain check — defense in depth on top of middleware + RLS
  const allowed = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in";
  if (!data.user.email.toLowerCase().endsWith("@" + allowed.toLowerCase())) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
