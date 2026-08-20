/**
 * Runs once per server process start (Next.js instrumentation hook) —
 * the one place to register the daily scheduled-report cron so it
 * isn't re-registered on every request. Guarded to the Node runtime
 * since this also fires for the edge runtime, which node-cron can't
 * run under.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const cron = await import("node-cron");
  const { sendDueScheduledReports } = await import("./lib/scheduledReportSender");

  // Ticks daily at 08:00 server time; sendDueScheduledReports filters
  // to whichever reports are actually configured for today, so most
  // ticks send nothing.
  cron.schedule("0 8 * * *", () => {
    sendDueScheduledReports().catch((err) => console.error("[scheduled-report] cron run failed:", err));
  });

  console.log("[scheduled-report] daily cron registered (08:00 server time)");
}
