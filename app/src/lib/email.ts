import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "StageForge <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

export type SendEmailResult = { sent: boolean; reason?: string };

/**
 * Thin wrapper so the rest of the app never touches the Resend SDK
 * directly. Without RESEND_API_KEY configured this logs and no-ops
 * instead of throwing, so a missing key degrades to "nothing sent"
 * rather than crashing whatever triggered the send (a cron tick or a
 * user's "send now" click).
 */
export async function sendEmail(opts: { to: string[]; subject: string; html: string }): Promise<SendEmailResult> {
  if (opts.to.length === 0) {
    return { sent: false, reason: "No recipients" };
  }
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping "${opts.subject}" to ${opts.to.join(", ")}`);
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    console.error("[email] send failed:", error);
    return { sent: false, reason: error.message };
  }
  return { sent: true };
}
