import { db } from "./db";
import { sendEmail } from "./email";
import { getPortfolioRows, renderPortfolioReportHtml } from "./portfolioReport";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://stageforge.pmopassport.co.uk";

export type SendScheduledReportResult = {
  sent: boolean;
  reason?: string;
  recipients: string[];
  skippedPlaceholders: string[];
};

// RFC 2606 reserved TLD — every seeded demo persona that hasn't had a
// real address swapped in uses it, so it's a reliable "this recipient
// can never actually receive mail" signal, not a guess.
const PLACEHOLDER_DOMAIN = /\.example$/i;

export async function sendScheduledReport(reportId: string): Promise<SendScheduledReportResult> {
  const report = await db.scheduledReport.findUniqueOrThrow({ where: { id: reportId } });
  const recipients = await db.user.findMany({
    // archivedAt: null so someone who's left the company since this
    // report was set up (archiveUser) quietly stops receiving it,
    // rather than needing every existing schedule hand-edited.
    where: { id: { in: report.recipientUserIds }, archivedAt: null },
    select: { email: true },
  });
  const allEmails = recipients.map((u) => u.email);
  const to = allEmails.filter((e) => !PLACEHOLDER_DOMAIN.test(e));
  const skippedPlaceholders = allEmails.filter((e) => PLACEHOLDER_DOMAIN.test(e));

  const rows = await getPortfolioRows();
  const html = renderPortfolioReportHtml(rows, APP_BASE_URL);

  const result = await sendEmail({
    to,
    subject: `StageForge portfolio summary — ${report.label}`,
    html,
  });

  if (result.sent) {
    await db.scheduledReport.update({ where: { id: reportId }, data: { lastSentAt: new Date() } });
  }

  return { ...result, recipients: to, skippedPlaceholders };
}

/** Every report whose dayOfWeek matches `now` — the cron itself ticks daily and relies on this filter. */
export async function sendDueScheduledReports(now: Date = new Date()): Promise<void> {
  const due = await db.scheduledReport.findMany({ where: { dayOfWeek: now.getDay() } });
  for (const report of due) {
    const result = await sendScheduledReport(report.id);
    if (result.sent) {
      const skipped = result.skippedPlaceholders.length > 0 ? ` (skipped placeholder: ${result.skippedPlaceholders.join(", ")})` : "";
      console.log(`[scheduled-report] sent "${report.label}" to ${result.recipients.join(", ")}${skipped}`);
    } else {
      console.warn(`[scheduled-report] skipped "${report.label}": ${result.reason}`);
    }
  }
}
