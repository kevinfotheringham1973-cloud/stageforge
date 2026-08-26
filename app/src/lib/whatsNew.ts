// Hand-written, stakeholder-facing release highlights — not auto-
// generated from PR titles (those are written for me, not for a Trust/
// FM Contractor reader) and not a complete engineering changelog.
// git log is the full technical history; this is a curated subset of
// what a non-technical stakeholder would actually care about, in plain
// language. Add a new entry by hand when something worth telling that
// audience about ships — don't try to keep this in lockstep with every
// PR.
export type ReleaseNote = {
  date: string; // "24 Aug 2026"
  title: string;
  highlights: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "26 Aug 2026",
    title: "Four more safety checks, sign-in activity tracking, PPM documentation requirement",
    highlights: [
      "Four more statutory safety checks now apply automatically wherever they're relevant — Work at Height, hot works permits, lone working, and asbestos refurbishment/demolition surveys — the same way StageForge already proposes fire risk and infection-control checks from a project's description.",
      "A platform admin can now see how much the team is actually using StageForge: every member's sign-in count and when they last logged in, alongside the existing list of people who tried and couldn't get in — both on the Access requests page.",
      "The 12 lifecycle-replacement checklists (Electrical, Domestic Hot & Cold Water, Boiler, Ventilation, Medical Gas, Chilled Water, Steam, Fire Suppression, Pneumatic Tube, and the three refresh templates) now also ask for valid PPM (Planned Preventative Maintenance) documentation for the plant being replaced, alongside the existing two-quote/lifecycle-approval requirement.",
      "The remaining 9 checklists (Lift, Nurse Call, BMS, Lighting, Fire Alarm, Security, Drainage, Above-ground Drainage, Compressed Air) now have that same competitive-quotes/lifecycle-cost-approval/PPM-documentation checkpoint too — previously only the other 12 asked for it.",
      "Checking an additional system when creating a new project now folds it into that same project's checklist — one combined set of gates — instead of creating a second, separate project.",
      "When a project does cover more than one system, its gates now group matching items from each system into a single shared checklist entry (rather than listing each system's version separately), and no longer show the same underlying item twice under two different names.",
      "New \"Mandatory approvals\" tab on every project: every Safety Group/Authorised Engineer/Authorised Person/statutory sign-off a project's own checklist calls for, whether someone's named against it yet, and whether it's actually been given.",
      "New \"Document templates\" page: a roadmap of which deliverables StageForge can (or will be able to) generate a pre-filled first-draft document for, using data already captured on the project — the Project Manager still reviews, edits, and owns the final version before uploading it as evidence.",
    ],
  },
  {
    date: "25 Aug 2026",
    title: "Real sign-in, passwordless email links, read-only demo links",
    highlights: [
      "Signing in is now required everywhere, replacing the open \"acting as\" switcher that used to be this demo's entire access model — the switcher survives as an admin-only preview tool layered on top of a real login.",
      "No password is ever created or stored for anyone. Sign in either with a company Microsoft account, or by email: enter your address and a one-time link is sent, valid only for someone a platform admin has already added.",
      "A platform admin can generate a read-only, expiring, revocable link for showing the demo to someone without giving them a real account — everything visible, nothing editable, until it expires or is revoked.",
      "Fixed an intermittent issue where clicking into a gate straight after loading a project with several gates could briefly look broken.",
      "New \"StageForge Health\" wordmark branding throughout.",
      "Fixed sign-in emails failing to deliver for anyone other than the platform admin's own address.",
      "A platform admin can now dismiss an access request once seen, and gets a clear on-screen alert (not just a nav-tucked page) whenever someone tries to sign in without access.",
    ],
  },
  {
    date: "24 Aug 2026",
    title: "Nine more system checklists, auto-populated project teams, clearer role switching",
    highlights: [
      "Nine more system checklists (Electrical, Chilled Water, Steam, Fire Suppression, Pneumatic Tube, Room/Ward Refresh, Mental Health Unit Ligature & Room Refresh, Theatre Refresh) now include a Pre-Contract Hold Point — no contractor is appointed until at least two competitive quotes and written lifecycle-cost approval are in place, closing a gap where detailed technical drawings were being requested before a project was even approved.",
      "New projects now auto-suggest which roles still need filling (Authorised Persons, Authorising Engineers, Principal Designer) based on the systems involved, with a live \"still needs assignment\" flag until a name is added.",
      "Project spend now requires the actual invoice to be uploaded before Finance can approve it — not just an amount and reference.",
      "The \"acting as\" switcher (standing in for separate logins in this demo) now leads with each person's role, not just their name.",
      "A new reference tool shows exactly what changes to run this system in England (HTM) instead of Scotland (SHTM), and can generate a full England-ready checklist library on demand — groundwork for whenever a Trust outside Scotland is onboarded.",
    ],
  },
  {
    date: "23 Aug 2026",
    title: "Multi-party sign-off, configurable approval authority, evidence storage",
    highlights: [
      "Compliance items that need more than one signature (e.g. HAI-SCRIBE needing both the Compliance Officer and the Client Authority) now support genuine parallel co-sign-off, rather than one person approving on everyone's behalf.",
      "Who can override a blocked compliance item, and who else must independently sign off, is now configurable per rule from an admin screen — no longer hardcoded.",
      "Authority roles are no longer a fixed list — a new role can be created and given override/bypass authority immediately, without a code change.",
      "Evidence files can now be stored in SharePoint rather than only on this server, once a Trust's SharePoint site is connected.",
      "A dedicated Team page for managing who's assigned to which role, project by project.",
    ],
  },
  {
    date: "20-22 Aug 2026",
    title: "Template library, financial tracking, portfolio view",
    highlights: [
      "The system checklist library grew to 9 discipline-specific templates (boiler & heating, water, ventilation, medical gases, fire alarm & detection, lifts, nurse call, BMS, electrical), each with its own regulatory citations and the right Authorised Person/Engineer requirement built in.",
      "A portfolio-wide view shows every project at a glance, plus a resource/capacity view showing who's allocated where and flagging anyone over 100%.",
      "Project spend now has a full PM to Finance approval workflow, with the ability to revise or delete a record before it's approved.",
      "Weekly scheduled email summaries for the SRO's portfolio review.",
      "Lessons learned are now recorded per gate and rolled up portfolio-wide, so patterns at the same stage across different projects are visible regardless of which project they came from.",
    ],
  },
  {
    date: "19 Aug 2026",
    title: "Compliance tracking goes live",
    highlights: [
      "Built out the underlying compliance rule library (the regulatory citations, evidence requirements, and override authority for each rule) and wired it into every project gate, so gates now show live compliance status alongside the delivery checklist, not just delivery on its own.",
    ],
  },
];
