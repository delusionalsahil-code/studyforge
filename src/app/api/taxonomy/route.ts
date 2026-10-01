import { json, route0 } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { loadTaxonomy, toClient } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

/** Active taxonomy for dependent selects. Every level carries its ancestor ids. */
export const GET = route0(async () => {
  await apiUser();
  return json(toClient(await loadTaxonomy()));
});
