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

/**
 * Next.js's own error-reporting hook — the one place that still sees a
 * server error's real message/stack in a production build, since React
 * deliberately strips both from what actually reaches the client (see
 * e.g. minified error #441, "An error occurred in the Server Components
 * render... The specific message is omitted in production builds").
 * Desktop-build only (STAGEFORGE_LOG_DIR is set only there, by
 * electron/main.js) — this app has no visible terminal once launched
 * normally, so without this a real crash leaves nothing to diagnose it
 * from beyond the opaque on-screen digest (found live, 29 Aug 2026: a
 * "new project" crash report with no way to see what actually threw).
 * The live tunnel-hosted server already has PM2's own log capture, so
 * this intentionally does nothing there.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const logDir = process.env.STAGEFORGE_LOG_DIR;
  if (!logDir) return;

  const { logServerError } = await import("./instrumentation-node");
  logServerError(logDir, err, request, context);
}
