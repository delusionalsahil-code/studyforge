import { json, route0 } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = route0(async () => {
  await destroySession();
  return json({ ok: true });
});
