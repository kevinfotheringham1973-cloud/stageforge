// Real authentication (24 Aug 2026), replacing the "acting as" cookie
// stub that used to trust a raw User.id with no identity check at all.
// Two providers:
//
// 1. Microsoft Entra ID -- the primary path for real Trust/FM Contractor
//    users. Almost every NHS/Hard FM organisation is already a Microsoft
//    365 shop, so this means no passwords of theirs for us to ever
//    store, and it's the sign-in model their own IT will expect anyway.
//    Configured multi-tenant ("common" issuer) so a user from ANY
//    organisation's Entra ID can sign in with their own org account --
//    NOT restricted to Transition Insight Partners Ltd's own tenant.
// 2. Resend magic-link email -- passwordless sign-in for anyone not on
//    a real Entra ID org account (Kevin, and demo-cast personas using a
//    real personal email). Replaces the original Credentials/password
//    provider entirely (25 Aug 2026, Kevin's explicit call): no
//    password is ever created, hashed, or stored anywhere. Reuses the
//    same Resend account as scheduled-report emails (email.ts), but
//    talks to the Resend API directly here rather than through that
//    helper -- Auth.js's provider needs to own the email's HTML/token,
//    not just send an already-composed message.
//
// Either way, signing in only ever gets you in if a User row with that
// email already exists (see the signIn callback) -- a platform admin
// adds people first (the /team page). No self-service signup, which is
// what a Trust security team actually expects from an access-controlled
// compliance tool, not an open one.
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";

const hasEntraIdConfig = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
);
const hasResendConfig = Boolean(process.env.RESEND_API_KEY);

// Third path, alongside Entra ID and Resend above: the self-contained
// desktop build (see electron/). No network, no email, no org account --
// STAGEFORGE_LOCAL_MODE=1 is set only in that build's own env, never in
// the real deployed app, and skips straight to a single fixed local
// admin identity. authorize() upserts that User row itself so the
// desktop installer never has to run a separate seed step just to get a
// signed-in identity to exist.
const hasLocalMode = process.env.STAGEFORGE_LOCAL_MODE === "1";
export const LOCAL_ADMIN_EMAIL = "local-admin@stageforge.local";

// Brand colours mirrored from tailwind.config.ts -- email clients don't
// load Tailwind, so these are inlined by hand here.
const WORDMARK_BLUE = "#28659B";
const WORDMARK_TEAL = "#2D9A9C";
const ACCENT = "#1F5C63";
const BG = "#EEF0EC";
const INK = "#1B2422";
const INK_MUTED = "#56635E";

function magicLinkEmailHtml(url: string): string {
  return `
<body style="background:${BG}; margin:0; padding:0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${BG}; padding:32px 0;">
    <tr>
      <td align="center">
        <table width="480" border="0" cellspacing="0" cellpadding="0" style="background:#FFFFFF; border-radius:10px; max-width:480px; width:100%;">
          <tr>
            <td align="center" style="padding:32px 24px 8px 24px; font-family:Georgia, 'Times New Roman', serif; font-weight:bold; font-size:20px; line-height:1.1;">
              <span style="color:${WORDMARK_BLUE};">StageForge</span> <span style="color:${WORDMARK_TEAL};">Health</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 0 24px; font-family:Helvetica, Arial, sans-serif; font-size:15px; line-height:22px; color:${INK};">
              Click below to sign in. This link expires in 24 hours and can only be used once.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px;">
              <a href="${url}" target="_blank"
                style="background:${ACCENT}; color:#FFFFFF; text-decoration:none; font-family:Helvetica, Arial, sans-serif; font-size:16px; font-weight:600; padding:12px 28px; border-radius:6px; display:inline-block;">
                Sign in to StageForge Health
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 32px 24px; border-top:1px solid #E4E7E1; font-family:Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; color:${INK_MUTED};">
              You're getting this because someone entered this email address on the StageForge Health sign-in page. If that wasn't you, no action is needed — no account changes are made until the link above is clicked.
              <br /><br />
              StageForge Health is provided by Transition Insight Partners Ltd.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
`;
}

function magicLinkEmailText(url: string): string {
  return `Sign in to StageForge Health\n\n${url}\n\nThis link expires in 24 hours and can only be used once.\n\nYou're getting this because someone entered this email address on the StageForge Health sign-in page. If that wasn't you, no action is needed.\n\nStageForge Health is provided by Transition Insight Partners Ltd.\n`;
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  // JWT session kept for simplicity. The original reason this was
  // forced (Auth.js requires JWT whenever a Credentials provider is
  // present) is gone now that Credentials has been replaced by Resend
  // below -- switching to database-backed sessions (real server-side
  // revocation, instead of waiting out a token's expiry) is a
  // reasonable follow-up, just not done as part of this change.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // Where a visitor lands immediately after requesting a magic link
    // (before they've clicked it) -- reusing /login itself with a flag
    // rather than Auth.js's generic built-in page, so the messaging
    // stays on-brand. See login/page.tsx's checkEmail search param.
    verifyRequest: "/login?checkEmail=1",
  },
  providers: [
    ...(hasEntraIdConfig
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: "https://login.microsoftonline.com/common/v2.0", // multi-tenant: any organisation's Entra ID, not just ours
            // Safe here specifically because signIn() below already
            // gates on a pre-existing User row by email (an admin adds
            // people first) and Entra ID verifies its email claims --
            // the auto-linking risk this flag normally warns about is
            // an unverified-email provider linking into someone else's
            // account, which doesn't apply.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(hasResendConfig
      ? [
          Resend({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL ?? "StageForge <onboarding@resend.dev>",
            // Overrides Auth.js's stock "Sign in to <host>" template (31
            // Aug 2026) -- that exact boilerplate, sent from a brand-new
            // domain with no reputation yet, was landing in Gmail's spam
            // folder. Real branding + a footer explaining why the email
            // arrived are trust signals spam filters weigh; the domain
            // still needs to build sending history over time regardless.
            sendVerificationRequest: async ({ identifier: to, url, provider }) => {
              const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${provider.apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: provider.from,
                  to,
                  subject: "Your StageForge Health sign-in link",
                  html: magicLinkEmailHtml(url),
                  text: magicLinkEmailText(url),
                }),
              });
              if (!res.ok) throw new Error("Resend error: " + JSON.stringify(await res.json()));
            },
          }),
        ]
      : []),
    ...(hasLocalMode
      ? [
          Credentials({
            id: "local",
            name: "Local",
            credentials: {},
            authorize: async () => {
              // A ProjectRoleAssignment always needs a departmentId
              // (standardTeam.ts's assignOne), sourced from the actor's
              // own homeDepartmentId -- without one, Local Admin
              // couldn't be auto-assigned PM on a project it creates
              // itself (assignStandardTeam silently no-ops, found live
              // 28 Aug 2026, right after removing "view as" as a way
              // around this: with that gone, this was the only route
              // left to any real usability at all). Not tied to either
              // seeded demo's branding -- a small standing home of its
              // own, since Local Admin isn't really part of either.
              // Company/Department have no compound unique constraint to
              // upsert against -- find-or-create instead, same effect.
              const localCompany =
                (await db.company.findFirst({ where: { name: "Desktop Trial", type: "FM_CONTRACTOR" } })) ??
                (await db.company.create({ data: { name: "Desktop Trial", type: "FM_CONTRACTOR" } }));
              const localDepartment =
                (await db.department.findFirst({ where: { companyId: localCompany.id, name: "Estates & Facilities" } })) ??
                (await db.department.create({ data: { companyId: localCompany.id, name: "Estates & Facilities" } }));

              const localUser = await db.user.upsert({
                where: { email: LOCAL_ADMIN_EMAIL },
                create: {
                  email: LOCAL_ADMIN_EMAIL,
                  name: "Local Admin",
                  isPlatformAdmin: true,
                  emailVerified: new Date(),
                  homeDepartmentId: localDepartment.id,
                },
                // Self-healing for a desktop install created before this
                // fix, whose Local Admin row still has no home department.
                update: { homeDepartmentId: localDepartment.id },
              });
              return { id: localUser.id, email: localUser.email, name: localUser.name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    // The actual access-control gate, for every provider: a sign-in
    // attempt for an email with no matching User row is rejected
    // outright, rather than silently provisioning a new account. Runs
    // for Resend at the point someone REQUESTS a link (so an
    // unapproved email never even gets one sent), not just after they
    // click it.
    signIn: async ({ user, account }) => {
      const existing = await db.user.findUnique({ where: { email: user.email ?? "" } });
      // Archived (left the company) is rejected the same way an
      // unknown email is -- their User row still exists (so past
      // evidence/sign-offs/audit history keeps their name), it just no
      // longer grants sign-in.
      if (existing && !existing.archivedAt) return true;

      // Logged for /access-requests (25 Aug 2026) -- as much a lead
      // signal as a security log, so failing to write it must never
      // break the actual rejection.
      if (user.email && account?.provider) {
        await db.rejectedSignInAttempt
          .upsert({
            where: { email_provider: { email: user.email, provider: account.provider } },
            create: { email: user.email, provider: account.provider },
            update: { attemptCount: { increment: 1 }, lastAttemptedAt: new Date() },
          })
          .catch((err) => console.error("[auth] failed to log rejected sign-in attempt:", err));
      }
      return false;
    },
    // JWT strategy: only the FIRST callback after sign-in gets `user`;
    // every later request only has the token, so the id has to be
    // copied onto it once here to survive.
    jwt: ({ token, user }) => {
      if (user) token.id = user.id;
      return token;
    },
    session: ({ session, token }) => {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  events: {
    // Fires only once a sign-in has genuinely completed -- for Resend
    // that's after the emailed link is actually clicked and verified,
    // not at the "link requested" stage callbacks.signIn above also
    // runs at, so this can't double-count an unclicked magic link as a
    // login. Logged for /access-requests (26 Aug 2026), the successful
    // counterpart to RejectedSignInAttempt -- must never break a real
    // sign-in, so failures are swallowed after logging.
    signIn: async ({ user, account }) => {
      if (!user.id) return;
      await db.successfulSignIn
        .upsert({
          where: { userId: user.id },
          create: { userId: user.id, provider: account?.provider ?? "unknown" },
          update: {
            loginCount: { increment: 1 },
            lastLoginAt: new Date(),
            ...(account?.provider ? { provider: account.provider } : {}),
          },
        })
        .catch((err) => console.error("[auth] failed to log successful sign-in:", err));
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
