import { z } from "zod";
import { json, route0 } from "@/lib/api";
import { apiAdmin } from "@/lib/auth";
import { createNode } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const LEVELS = ["curriculum", "exam", "class", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept", "question_type"] as const;

const Body = z.object({
  level: z.enum(LEVELS),
  parent: z.object({ level: z.enum(LEVELS), id: z.number().int().positive() }).nullish(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(500).nullish(),
  orderIndex: z.number().int().optional(),
});

export const POST = route0(async (req) => {
  await apiAdmin();
  const body = Body.parse(await req.json().catch(() => ({})));
  const row = await createNode(body);
  return json({ node: row }, 201);
});
