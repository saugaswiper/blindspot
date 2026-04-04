import { redirect } from "next/navigation";

/**
 * /search is no longer a destination — the search pipeline runs via /api/search
 * and redirects directly to /results/<id>. Any direct navigation here goes home.
 */
export default function SearchPage() {
  redirect("/");
}
