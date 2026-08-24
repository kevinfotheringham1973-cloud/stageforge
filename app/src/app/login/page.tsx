import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "That account isn't set up yet — ask a platform admin to add you first.",
  CredentialsSignin: "Incorrect email or password.",
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

async function credentialsSignIn(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
}

/**
 * Replaces the old open "acting as" switcher as the front door — see
 * session.ts's header comment for why that had to go. hasEntraId hides
 * the Microsoft button entirely rather than showing a button that would
 * just error, matching the codebase's existing convention for optional
 * integrations (SharePoint, scheduled-report email) staying invisible
 * without their env vars set.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const hasEntraId = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center leading-none">
        <span className="font-serif text-xl font-bold text-accent">StageForge</span>
        <span className="font-serif text-xs font-semibold tracking-wide text-inkmuted">Health</span>
      </div>

      {error && (
        <div className="w-full rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
        </div>
      )}

      {hasEntraId && (
        <form action={microsoftSignIn} className="w-full">
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Sign in with Microsoft
          </button>
        </form>
      )}

      {hasEntraId && (
        <div className="flex w-full items-center gap-3 text-xs text-inkmuted">
          <div className="h-px flex-1 bg-rule" />
          <span>or</span>
          <div className="h-px flex-1 bg-rule" />
        </div>
      )}

      <form action={credentialsSignIn} className="flex w-full flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded-md border border-rule bg-bg px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded-md border border-rule bg-bg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-rule px-4 py-2.5 text-sm font-semibold text-accent hover:bg-surface2"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
