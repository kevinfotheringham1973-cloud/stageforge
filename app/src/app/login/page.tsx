import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "That email isn't set up yet — ask a platform admin to add you first.",
  ShareLinkExpired: "This demo link has expired or been revoked — ask whoever shared it for a new one.",
};

async function microsoftSignIn() {
  "use server";
  try {
    await signIn("microsoft-entra-id", { redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
}

async function emailSignIn(formData: FormData) {
  "use server";
  try {
    await signIn("resend", { email: formData.get("email"), redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
}

/**
 * Replaces the old open "acting as" switcher as the front door — see
 * session.ts's header comment for why that had to go. hasEntraId/
 * hasResend hide their button entirely rather than showing one that
 * would just error, matching the codebase's existing convention for
 * optional integrations (SharePoint, scheduled-report email) staying
 * invisible without their env vars set.
 *
 * No password field anywhere (25 Aug 2026) -- the only two ways in are
 * an Entra ID org account or a magic link emailed to an address that's
 * already a User row (see auth.ts's signIn callback). Nothing is ever
 * stored to check a password against.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkEmail?: string }>;
}) {
  const { error, checkEmail } = await searchParams;
  const hasEntraId = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center leading-[0.95]">
        <span className="font-serif text-xl font-bold text-wordmarkBlue">StageForge</span>
        <span className="font-serif text-xl font-bold text-wordmarkTeal">Health</span>
      </div>

      {error && (
        <div className="w-full rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
        </div>
      )}

      {checkEmail && !error && (
        <div className="w-full rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
          Check your email for a sign-in link. It only works for an address a platform admin has already added.
        </div>
      )}

      {hasResend && (
        <form action={emailSignIn} className="flex w-full flex-col gap-2">
          <p className="text-xs text-inkmuted">Most people: enter your email and we&rsquo;ll send you a link.</p>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="rounded-md border border-rule bg-bg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Email me a sign-in link
          </button>
        </form>
      )}

      {hasEntraId && hasResend && (
        <div className="flex w-full items-center gap-3 text-xs text-inkmuted">
          <div className="h-px flex-1 bg-rule" />
          <span>or</span>
          <div className="h-px flex-1 bg-rule" />
        </div>
      )}

      {hasEntraId && (
        <form action={microsoftSignIn} className="flex w-full flex-col gap-2">
          <p className="text-xs text-inkmuted">Signing in with a company Microsoft account instead?</p>
          <button
            type="submit"
            className="w-full rounded-md border border-rule px-4 py-2.5 text-sm font-semibold text-accent hover:bg-surface2"
          >
            Sign in with Microsoft
          </button>
        </form>
      )}
    </div>
  );
}
