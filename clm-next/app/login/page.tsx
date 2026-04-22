"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get("error");
    if (err === "domain_not_allowed") {
      setError(`Only ${process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in"} accounts are permitted. Please sign in with your work email.`);
    } else if (err === "auth_failed") {
      setError("Sign-in failed. Please try again.");
    }
  }, [params]);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo =
        window.location.origin + "/auth/callback" +
        (params.get("redirectTo") ? `?next=${encodeURIComponent(params.get("redirectTo")!)}` : "");

      const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in";

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            // Google Workspace domain hint — suppresses non-@openhouse.in accounts
            // in the chooser, though we also enforce on the server.
            hd: allowedDomain,
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (signInError) throw signInError;
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
      setLoading(false);
    }
  }

  const domain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in";

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 12l9-9 9 9" />
            <path d="M5 10v10h14V10" />
            <path d="M10 20v-6h4v6" />
          </svg>
        </div>
        <h1 className="login-title">Openhouse CLM</h1>
        <p className="login-subtitle">
          Asset Management Agreement workspace for the Supply Ops team.
        </p>

        {error && <div className="login-error">{error}</div>}

        <button className="login-btn google" onClick={handleGoogleSignIn} disabled={loading}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>

        <div className="login-note">
          Only <strong>@{domain}</strong> Google accounts are accepted.<br />
          First person to sign in becomes admin — they can promote teammates later.
        </div>
      </div>

      <style jsx>{`
        .login-wrap {
          min-height: 100vh;
          background: linear-gradient(135deg, #f5f1e8 0%, #e7e0d0 100%);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          font-family: 'DM Sans', -apple-system, sans-serif;
        }
        .login-card {
          background: #fefcf5;
          border: 1px solid #e7e0d0;
          border-radius: 14px;
          padding: 32px 32px 26px;
          width: 100%; max-width: 420px;
          box-shadow: 0 12px 48px rgba(28, 25, 23, 0.08);
        }
        .login-logo {
          width: 44px; height: 44px;
          background: #1c1917; color: #f5f1e8;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 18px;
        }
        .login-logo :global(svg) { width: 24px; height: 24px; }
        .login-title {
          font-family: 'Instrument Serif', serif;
          font-size: 28px; color: #1c1917;
          margin: 0 0 6px; letter-spacing: -0.01em;
        }
        .login-subtitle {
          font-size: 13px; color: #78716c;
          margin: 0 0 22px; line-height: 1.5;
        }
        .login-error {
          background: #fee2e2; color: #7f1d1d;
          border: 1px solid #fecaca;
          padding: 10px 12px; border-radius: 6px;
          font-size: 12px; margin-bottom: 12px;
          line-height: 1.45;
        }
        .login-btn {
          width: 100%; padding: 12px;
          background: white; color: #1c1917;
          border: 1px solid #d6d3d1;
          border-radius: 8px;
          font-size: 14px; font-weight: 500;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
          transition: background 0.15s, box-shadow 0.15s;
          font-family: inherit;
        }
        .login-btn:hover:not(:disabled) {
          background: #fbf8f1;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-note {
          margin-top: 18px; padding-top: 18px;
          border-top: 1px solid #e7e0d0;
          font-size: 11px; color: #78716c;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
