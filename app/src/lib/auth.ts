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
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";

const hasEntraIdConfig = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
);
const hasResendConfig = Boolean(process.env.RESEND_API_KEY);

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
    signIn: async ({ user }) => {
      const existing = await db.user.findUnique({ where: { email: user.email ?? "" } });
      return Boolean(existing);
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
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
