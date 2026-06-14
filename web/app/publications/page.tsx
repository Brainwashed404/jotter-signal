import { redirect } from "next/navigation";

// Publications was folded into Experts (one page with an Experts/Publications toggle).
// Keep this route as a redirect so old links still resolve.
export default function PublicationsPage() {
  redirect("/sources");
}
