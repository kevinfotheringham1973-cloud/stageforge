import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createRole, createUser, deleteRole } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamRoster } from "@/components/TeamRoster";
import { forbidden } from "next/navigation";
import { ROLE_CATEGORY_LABEL, ROLE_CATEGORY_ORDER, groupRolesByCategory } from "@/lib/roleCategories";

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
  if (!currentUser?.isPlatformAdmin) forbidden();

  const [usersRaw, departments, projects, roles] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      include: { homeDepartment: { include: { company: true } }, roleAssignments: { include: { role: true } } },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, include: { company: true } }),
    db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, projectNumber: true } }),
    db.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { assignments: true } } } }),
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

      <div className="mb-8 rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">+ Add role</h2>
        <p className="mb-3 text-sm text-inkmuted">
          A role is a job/appointment, like &ldquo;Fire Officer&rdquo; or &ldquo;Compliance Officer&rdquo; — not a
          specific person. Add one here (e.g. &ldquo;Head of Estates&rdquo;) and it becomes available straight
          away wherever roles are used: assigning someone to a project below, and on the{" "}
          <a href="/compliance-rules" className="text-accent underline">
            Compliance rules
          </a>{" "}
          page as an override or sign-off authority.
        </p>
        <form action={createRole} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Role name
            </label>
            <input
              name="name"
              placeholder="e.g. Head of Estates"
              required
              className="w-64 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Group
            </label>
            <select
              name="category"
              defaultValue="PROJECT_TEAM"
              className="w-64 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            >
              {ROLE_CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {ROLE_CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
            <p className="mt-1 max-w-xl text-xs text-inkmuted">
              Just for tidying the lists elsewhere — which heading this role sits under on the Compliance rules
              page. Doesn&rsquo;t change what the role can do.
            </p>
          </div>
          <label className="flex max-w-xl items-start gap-2 text-sm">
            <input type="checkbox" name="isExactMatchAuthority" className="mt-0.5" />
            <span>
              This role can act on its own, and nobody else can act in its place — not even the Senior
              Responsible Owner. Tick this for a genuinely distinct professional or statutory authority (like Fire
              Officer, who an SRO has no standing to override). Leave it unticked for an ordinary role the SRO can
              still act through if needed (like Compliance Officer).
            </span>
          </label>
          <div>
            <SubmitButton pendingText="Adding…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
              Add role
            </SubmitButton>
          </div>
        </form>

        <h3 className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Existing roles</h3>
        <div className="flex flex-col gap-2">
          {groupRolesByCategory(roles).map((group) => (
            <div key={group.category}>
              <div className="mb-1 text-xs font-semibold text-inkmuted">{group.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {group.roles.map((role) => (
                  <span
                    key={role.id}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                      role.isExactMatchAuthority ? "bg-risk/15 text-risk" : "bg-accentsoft text-accent"
                    }`}
                    title={role.isExactMatchAuthority ? "Nobody else, including SRO, can act in its place" : "SRO can act through this role too"}
                  >
                    {role.name}
                    {role._count.assignments > 0 ? (
                      <span title={`Assigned on ${role._count.assignments} project role assignment${role._count.assignments === 1 ? "" : "s"} — remove those first to delete`}>
                        🔒
                      </span>
                    ) : (
                      <form action={deleteRole.bind(null, role.id)} className="inline">
                        <button type="submit" title={`Delete "${role.name}"`} className="hover:text-risk">
                          ×
                        </button>
                      </form>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <TeamRoster users={users} projects={projects} roles={roles} />
    </div>
  );
}
