import { redirect } from "next/navigation";

// The portfolio view is now the landing page (confirmed 20
// Aug 2026) — this route stays only so an old /portfolio link/bookmark
// still lands somewhere sensible.
export default function PortfolioRedirectPage() {
  redirect("/");
}
