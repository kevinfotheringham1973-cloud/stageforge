// Display grouping for Role.category (RoleCategory) — shared between the
// Team page's "+ Add role" form and the Compliance rules page's role
// dropdown/checkboxes, so both group and order roles the same way. Plain
// language, not the enum names, since this is what admins actually read.
import { RoleCategory } from "@prisma/client";

export const ROLE_CATEGORY_LABEL: Record<RoleCategory, string> = {
  SENIOR_CONTRACTUAL: "Senior & contractual roles",
  PROJECT_TEAM: "Project & support team",
  AUTHORISED_PERSON_ENGINEER: "Authorised Persons & Engineers",
  STATUTORY_OFFICER: "Statutory & safety officers",
};

// Display order — senior/accountable roles first, discipline specialists
// last, matching how the rest of the app orders authority (SRO down to
// discipline APs).
export const ROLE_CATEGORY_ORDER: RoleCategory[] = [
  "SENIOR_CONTRACTUAL",
  "PROJECT_TEAM",
  "STATUTORY_OFFICER",
  "AUTHORISED_PERSON_ENGINEER",
];

export function groupRolesByCategory<T extends { category: RoleCategory }>(roles: T[]): { category: RoleCategory; label: string; roles: T[] }[] {
  return ROLE_CATEGORY_ORDER.map((category) => ({
    category,
    label: ROLE_CATEGORY_LABEL[category],
    roles: roles.filter((r) => r.category === category),
  })).filter((group) => group.roles.length > 0);
}
