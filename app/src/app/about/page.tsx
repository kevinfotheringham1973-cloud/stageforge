import { getCurrentUser } from "@/lib/session";
import { forbidden } from "next/navigation";
import { getBuildInfo } from "@/lib/buildInfo";

/**
 * Platform-admin-only, read-only. What's actually deployed -- the
 * first thing anyone troubleshooting a live Trust/FM Contractor
 * deployment will ask. See buildInfo.ts for why this shows a git
 * commit rather than a semver number.
 */
export default async function AboutPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isPlatformAdmin) forbidden();

  const info = getBuildInfo();
  const rows: { label: string; value: string }[] = [
    { label: "Commit", value: info.commitSha },
    { label: "Commit date", value: info.commitDate === "unknown" ? "unknown" : new Date(info.commitDate).toLocaleString("en-GB") },
    { label: "Node.js", value: info.nodeVersion },
    { label: "Next.js", value: info.nextVersion },
    { label: "React", value: info.reactVersion },
    { label: "Prisma Client", value: info.prismaClientVersion },
    { label: "Environment", value: process.env.NODE_ENV ?? "unknown" },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">About</h1>
      <p className="mb-8 text-sm text-inkmuted">
        What&rsquo;s actually deployed on this instance. Platform admin only.
      </p>

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
              i > 0 ? "border-t border-rule" : ""
            }`}
          >
            <span className="text-inkmuted">{row.label}</span>
            <span className="font-mono text-xs">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
