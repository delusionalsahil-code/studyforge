import { z } from "zod";
import { ApiError, json, routeP } from "@/lib/api";
import { apiAdmin } from "@/lib/auth";
import { deleteNode, updateNode } from "@/lib/taxonomy";
import type { Level } from "@/lib/taxonomy-types";

export const dynamic = "force-dynamic";

const LEVELS = ["curriculum", "exam", "class", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept", "question_type"];
const Patch = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(500).nullish(),
  orderIndex: z.number().int().optional(),
  active: z.boolean().optional(),
});

function parse(p: { level: string; id: string }) {
  const id = Number(p.id);
  if (!LEVELS.includes(p.level) || !Number.isInteger(id)) throw new ApiError(400, "Invalid taxonomy reference", "VALIDATION");
  return { level: p.level as Level, id };
}

export const PATCH = routeP<{ level: string; id: string }>(async (req, params) => {
  await apiAdmin();
  const { level, id } = parse(params);
  const body = Patch.parse(await req.json().catch(() => ({})));
  const row = await updateNode(level, id, body);
  return json({ node: row });
});

export const DELETE = routeP<{ level: string; id: string }>(async (_req, params) => {
  await apiAdmin();
  const { level, id } = parse(params);
  await deleteNode(level, id);
  return json({ ok: true });
});
