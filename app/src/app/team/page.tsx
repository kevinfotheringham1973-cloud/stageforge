import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createUser } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamRoster } from "@/components/TeamRoster";
import { notFound } from "next/navigation";

/**
 * Platform-admin-only. The in-app replacement for hand-editing
 * prisma/seed.ts to add a person, fix their name/email, or put them on
 * a project. See actions.ts#updateUser for the rename-vs-replace
 * distinction this page's copy below is explaining. The list itself
 * (search + per-person edit/assign) lives in TeamRoster, a client
 * component — everything here stays server-rendered.
 */
export default async function TeamPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isPlatformAdmin) notFound();

  const [usersRaw, departments, projects, roles] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      include: { homeDepartment: { include: { company: true } }, roleAssignments: { include: { role: true } } },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, include: { company: true } }),
    db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, projectNumber: true } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  const users = usersRaw.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    departmentLabel: u.homeDepartment ? `${u.homeDepartment.name} (${u.homeDepartment.company.name})` : "No department",
    roleLabel: Array.from(new Set(u.roleAssignments.map((a) => a.role.name))).join(" · "),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Team</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Add a person, fix their name or email, or put them on a project. Platform admin only.
      </p>

      <div className="mb-8 rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">+ Add person</h2>
        <form action={createUser} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Name</label>
            <input
              name="name"
              required
              className="w-48 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-56 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Department
            </label>
            <select
              name="homeDepartmentId"
              required
              className="w-56 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            >
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.company.name})
                </option>
              ))}
            </select>
          </div>
          <SubmitButton pendingText="Adding…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            Add person
          </SubmitButton>
        </form>
      </div>

      <TeamRoster users={users} projects={projects} roles={roles} />
    </div>
  );
}
