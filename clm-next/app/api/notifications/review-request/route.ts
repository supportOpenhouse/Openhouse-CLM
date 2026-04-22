import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServer, createServiceClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  // Auth gate — only authenticated users can trigger notifications
  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { agreementId, agreementName, versionId, versionName, submittedBy } = body;

  if (!agreementId || !versionId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    // Silently succeed when email isn't configured — app still works without notifications
    return NextResponse.json({ ok: true, sent: 0, note: "Email not configured" });
  }

  // Use service client to list admins (bypasses RLS for system work)
  const svc = createServiceClient();
  const { data: admins } = await svc.from("users").select("email").eq("role", "admin");
  if (!admins || admins.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const link = `${appUrl}/agreements/${agreementId}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1c1917;">
      <div style="background: #fbf8f1; border-radius: 12px; padding: 24px; border: 1px solid #e7e0d0;">
        <div style="display: inline-block; background: #1c1917; color: #f5f1e8; width: 36px; height: 36px; border-radius: 8px; text-align: center; line-height: 36px; font-weight: 700; margin-bottom: 12px;">OH</div>
        <h1 style="font-family: Georgia, serif; font-size: 22px; margin: 0 0 6px; color: #1c1917;">Version awaiting your review</h1>
        <p style="font-size: 13px; color: #78716c; margin: 0 0 20px;">Openhouse CLM · approval request</p>

        <div style="background: white; border-radius: 8px; padding: 16px 20px; border: 1px solid #e7e0d0; margin-bottom: 20px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #78716c; margin-bottom: 6px;">Agreement</div>
          <div style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">${escapeHtml(agreementName || "Untitled")}</div>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #78716c; margin-bottom: 6px;">Version</div>
          <div style="font-size: 14px; margin-bottom: 12px;">${escapeHtml(versionName || "Untitled version")}</div>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #78716c; margin-bottom: 6px;">Submitted by</div>
          <div style="font-size: 14px;">${escapeHtml(submittedBy || user.email!)}</div>
        </div>

        <a href="${link}" style="display: inline-block; background: #1c1917; color: #f5f1e8; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
          Review in CLM →
        </a>

        <p style="font-size: 12px; color: #78716c; margin: 20px 0 0; line-height: 1.6;">
          You're getting this email because you're an admin on Openhouse CLM.
          Click the button above to approve or reject this version.
        </p>
      </div>
    </div>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  try {
    for (const admin of admins) {
      if (!admin.email || admin.email === submittedBy) continue; // Don't email the submitter
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: admin.email,
          subject: `Review needed: "${agreementName || "Agreement"}"`,
          html,
        });
        sent++;
      } catch (e) {
        console.error("send to", admin.email, e);
      }
    }
    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    console.error("email batch", e);
    return NextResponse.json({ error: e.message || "Email send failed" }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const runtime = "nodejs";
