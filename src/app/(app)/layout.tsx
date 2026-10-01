import type { ReactNode } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { endOfToday } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const res = await db.execute(sql`
    select count(*)::int as n from revision_state rs join questions q on q.id = rs.question_id
    where rs.user_id = ${user.id} and q.processing_status = 'completed' and rs.due_at < ${endOfToday(user.timezone)}`);
  const dueCount = Number((res.rows[0] as { n: number }).n);
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} dueCount={dueCount}>
      {children}
    </AppShell>
  );
}
