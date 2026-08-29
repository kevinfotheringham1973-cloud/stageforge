// Split out of instrumentation.ts so its fs/path imports are never
// statically visible to the Edge Runtime bundle -- instrumentation.ts's
// own runtime guard (if NEXT_RUNTIME !== "nodejs") only skips *calling*
// this at runtime, but Next's bundler still analyzes every import in
// that file for edge-compat regardless of which branch guards it,
// producing an "Ecmascript file had an error" warning (fs/path aren't
// supported in the Edge Runtime) even though the code path is
// unreachable there. A dynamic import() of an entirely separate module,
// done only from inside the runtime-guarded branch, keeps this file's
// node-only code out of that analysis entirely.
import fs from "fs";
import path from "path";

export function logServerError(
  logDir: string,
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string }
) {
  try {
    const e = err as { message?: unknown; stack?: unknown; digest?: unknown };
    const entry = {
      time: new Date().toISOString(),
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      digest: e?.digest,
      message: e?.message,
      stack: e?.stack,
    };
    fs.appendFileSync(path.join(logDir, "server-errors.log"), JSON.stringify(entry) + "\n");
  } catch {
    // Never let logging itself take down the request it's reporting on.
  }
}
