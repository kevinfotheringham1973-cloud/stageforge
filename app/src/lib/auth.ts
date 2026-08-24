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
// 2. Credentials (email + password) -- the fallback for Kevin and the
//    seeded demo cast, since those aren't real Microsoft accounts.
//
// Either way, signing in only ever gets you in if a User row with that
// email already exists (see the signIn callback) -- a platform admin
// adds people first. No self-service signup, which is what a Trust
// security team actually expects from an access-controlled compliance
// tool, not an open one.
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "./db";

const hasEntraIdConfig = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
);

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  // Auth.js requires JWT sessions whenever a Credentials provider is
  // present -- database sessions only work for adapter-native providers
  // (confirmed against the running dev server: "Signing in with
  // credentials only supported if JWT strategy is enabled"). The
  // adapter still handles User/Account lookups and linking either way;
  // this only changes how the session itself is stored (an encrypted
  // cookie, not a Session table row) -- the real tradeoff is no
  // server-side session revocation before a token's own expiry.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
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
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null; // no credentials login set up for this account -- e.g. an Entra-only user

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    // The actual access-control gate: an Entra ID sign-in from a real
    // email with no matching User row is rejected outright, rather than
    // silently provisioning a new account. (Credentials sign-ins are
    // already gated in authorize() above via passwordHash being unset.)
    signIn: async ({ user, account }) => {
      if (account?.provider !== "microsoft-entra-id") return true;
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
