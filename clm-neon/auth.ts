import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db-client";
import { users, accounts, sessions, verificationTokens } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";

// Augment NextAuth types so session.user has our custom fields
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: "admin" | "editor";
      displayName?: string | null;
    } & DefaultSession["user"];
  }
}

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          // Restrict Google Workspace sign-in chooser to openhouse.in accounts
          hd: ALLOWED_DOMAIN,
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          role: "editor",
          displayName: profile.name,
        };
      },
    }),
  ],
  callbacks: {
    // Called on every sign-in attempt — our last line of defense against non-openhouse accounts
    async signIn({ user, profile }) {
      if (!user.email) return false;
      if (!user.email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN.toLowerCase())) {
        return false;
      }
      // Google's `hd` claim is the authoritative signal — verify it
      if (profile && (profile as any).hd && (profile as any).hd !== ALLOWED_DOMAIN) {
        return false;
      }
      return true;
    },
    // Populate session.user with our role field on every request
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        (session.user as any).role = (user as any).role || "editor";
        (session.user as any).displayName = (user as any).displayName || user.name;
      }
      return session;
    },
  },
  events: {
    // First user to sign in becomes admin; update last_login on each visit
    async signIn({ user }) {
      if (!user.id || !user.email) return;
      const adminCountResult = await db.execute<{ admin_count: number }>(
        sql`select count(*)::int as admin_count from users where role = 'admin'`
      );
      const admin_count = adminCountResult.rows[0]?.admin_count ?? 0;
      const patch: any = { lastLogin: new Date() };
      if (admin_count === 0) patch.role = "admin";
      // Derive a display name if missing
      if (!(user as any).displayName) {
        const local = user.email.split("@")[0] || "";
        patch.displayName =
          user.name ||
          local
            .split(/[._\-+]/)
            .filter(Boolean)
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" ");
      }
      await db.update(users).set(patch).where(eq(users.id, user.id));
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
